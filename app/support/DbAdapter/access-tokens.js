///////////////////////////////////////////////////
// Access tokens
///////////////////////////////////////////////////

const accessTokensTrait = (superClass) => class extends superClass {
  async getAccessTokens(currentUserId) {
    return await this.database
      .select('uid', 'description', 'code', 'created_at', 'last_used_at', 'status')
      .from('access_tokens')
      .where('user_id', currentUserId)
      .orderBy('id', 'asc');
  }

  async getAccessTokenById(currentUserId, tokenId) {
    return await this.database
      .first('uid', 'description', 'code', 'created_at', 'last_used_at', 'status')
      .from('access_tokens')
      .where({ user_id: currentUserId, uid: tokenId });
  }

  async createAccessToken(userId, description, code) {
    const res = await this.database
      .table('access_tokens')
      .insert({
        user_id: userId,
        description,
        code
      })
      .returning('uid');

    return res[0];
  }

  async revokeAccessToken(tokenId) {
    return await this.database
      .table('access_tokens')
      .update('status', 'revoked')
      .where('uid', tokenId);
  }

  async getUserIdByAccessToken(code) {
    // 1. Select `user_id`
    // 2. Update `last_used_at` if it's older than 60 seconds
    return await this.database.transaction(async (trx) => {
      const { rows } = await trx.raw(
        'SELECT user_id, last_used_at FROM access_tokens WHERE code = :code AND status = :status FOR UPDATE',
        { code, status: 'active' }
      );

      if (rows.length === 0) {
        return null;
      }

      const lastUsedAt = new Date(rows[0].last_used_at).getTime();
      const now = new Date().getTime();

      if (now - lastUsedAt > 60 * 1000) {
        await trx
          .table('access_tokens')
          .update('last_used_at', 'now')
          .where({ code, status: 'active' });
      }

      return rows[0].user_id;
    });
  }
};

export default accessTokensTrait;
