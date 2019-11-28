import { load as configLoader } from '../../config/config';


const config = configLoader();

export function addServerInfoModel(dbAdapter) {
  return class ServerInfo {
    static async isRegistrationOpen({ interval, maxCount } = config.registrationsLimit) {
      const count = await dbAdapter.getLatestUsersCount(interval);
      return count < maxCount;
    }
  };
}
