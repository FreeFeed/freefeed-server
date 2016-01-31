import { load as configLoader } from "../../config/config"

const config = configLoader()


export class FeedFactory
{
  static stopList(default_stop_list) {
    if (default_stop_list)
      return config.application.DEFAULT_STOP_LIST

    return config.application.USERNAME_STOP_LIST
  }
}
