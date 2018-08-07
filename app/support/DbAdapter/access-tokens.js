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
};

export default accessTokensTrait;
