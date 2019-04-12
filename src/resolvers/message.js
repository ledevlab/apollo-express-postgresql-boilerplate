const Sequelize = require('sequelize');
const { combineResolvers } = require('graphql-resolvers');

const { pubsub, EVENTS } = require('../subscription');
const { isAuthenticated, isMessageOwner } = require('./authorization');

const toCursorHash = string => Buffer.from(string).toString('base64');

const fromCursorHash = string =>
  Buffer.from(string, 'base64').toString('ascii');

const list = async (parent, { cursor, limit = 100 }, { models }) => {
  const cursorOptions = cursor
    ? {
      where: {
        createdAt: {
          [Sequelize.Op.lt]: fromCursorHash(cursor),
        },
      },
    }
    : {};

  const messages = await models.Message.findAll({
    order: [['createdAt', 'DESC']],
    limit: limit + 1,
    ...cursorOptions,
  });

  const hasNextPage = messages.length > limit;
  const edges = hasNextPage ? messages.slice(0, -1) : messages;

  return {
    edges,
    pageInfo: {
      hasNextPage,
      endCursor: toCursorHash(
        edges[edges.length - 1].createdAt.toString(),
      ),
    },
  };
};

const findOne = async (parent, { id }, { models }) => {
  return await models.Message.findByPk(id);
};

const create = async (parent, { text }, { models, me }) => {
  const message = await models.Message.create({
    text,
    userId: me.id,
  });

  pubsub.publish(EVENTS.MESSAGE.CREATED, {
    messageCreated: { message },
  });

  return message;
};

const deleteMessage = async (parent, { id }, { models }) => {
  return await models.Message.destroy({ where: { id } });
};

const fetchUser = async (message, args, { loaders }) => {
  return await loaders.user.load(message.userId);
};

const subscribe = () => pubsub.asyncIterator(EVENTS.MESSAGE.CREATED);

module.exports = {
  Query: {
    messages: list,
    message: findOne,
  },

  Mutation: {
    createMessage: combineResolvers(
      isAuthenticated,
      create
    ),

    deleteMessage: combineResolvers(
      isAuthenticated,
      isMessageOwner,
      deleteMessage,
    ),
  },

  Message: {
    user: fetchUser,
  },

  Subscription: {
    messageCreated: {
      subscribe: subscribe,
    },
  },
};
