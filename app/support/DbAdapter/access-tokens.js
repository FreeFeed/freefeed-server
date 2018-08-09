/**
 * Get list of access tokens
 */
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
    // Update last_used_at for this token AND select user_id at the same time
    const res = await this.database
      .table('access_tokens')
      .update('last_used_at', 'now')
      .where({ code, status: 'active' })
      .returning('user_id');

    if (res.length === 0) {
      return null;
    }
    return res[0];
  }
};

export default accessTokensTrait;
