// src/utils/catchAsync.js
const catchAsync = function (fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

export default catchAsync;
