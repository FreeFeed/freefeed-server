import config from 'config';


export function addServerInfoModel(dbAdapter) {
  return class ServerInfo {
    static async isRegistrationOpen({ interval, maxCount } = config.registrationsLimit) {
      const count = await dbAdapter.getLatestUsersCount(interval);
      return count < maxCount;
    }
  };
}
