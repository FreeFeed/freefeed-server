export default function deprecated(comment) {
  return function (ctx) {
    ctx.status = 410;
    ctx.body = { err: `This method is deprecated. ${comment}` };
  }
}
