module.exports = {
  workspace: {
    getConfiguration: jest.fn().mockReturnValue({
      get: jest.fn().mockImplementation((key, defaultValue) => defaultValue),
    }),
  },
};
