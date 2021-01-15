const serverInfoTrait = (superClass) =>
  class extends superClass {
    /**
     * Returns number of users registered during the last interval
     *
     * @param {string} interval
     */
    async getLatestUsersCount(interval) {
      const {
        rows,
      } = await this.database.raw(
        `select count(*) from users where type = 'user' and created_at >= now() - :intrvl::interval`,
        { intrvl: interval },
      );

      return parseInt(rows[0].count);
    }
  };

export default serverInfoTrait;
