import _ from 'lodash';

/**
 * List represents a possible open list of items. It can model two situation:
 * 1. All these items (when 'inclusive' is true);
 * 2. All items EXCEPT of these (when 'inclusive' is false).
 */
export class List {
  items = [];
  inclusive = true;

  /**
   * @param {array} items
   * @param {boolean} inclusive
   */
  constructor(items = [], inclusive = true) {
    this.items = items;
    this.inclusive = inclusive;
  }

  isEmpty() {
    return this.inclusive && this.items.length === 0;
  }

  isEverything() {
    return !this.inclusive && this.items.length === 0;
  }

  includes(item) {
    return this.inclusive === this.items.includes(item);
  }

  /**
   * Return List made of items if arg is an array, arg themself if it is a List instance,
   * or re-created List if arg has shape of List. The returning object is always a List instance.
   *
   * @param {array|List|any} list
   * @return {List}
   */
  static from(list) {
    if (list instanceof List) {
      return list;
    } else if (Array.isArray(list)) {
      return new List(list);
    } else if (
      typeof list === 'object' &&
      Array.isArray(list.items) &&
      typeof list.inclusive === 'boolean'
    ) {
      return new List(list.items, list.inclusive);
    }

    return List.empty();
  }

  /**
   * @return {List}
   */
  static empty() {
    return new List();
  }

  /**
   * @return {List}
   */
  static everything() {
    return new List([], false);
  }

  /**
   * Return the inversion of list i.e. List.difference(List.everything(), list)
   *
   * @param {List|array} list
   * @param {List} list
   */
  static inverse(list) {
    list = List.from(list);
    return new List(list.items, !list.inclusive);
  }

  /**
 * @param {List|array} list1
 * @param {List|array} list2
 * @return {List}
 */
  static difference(list1, list2) {
    list1 = List.from(list1);
    list2 = List.from(list2);

    if (list1.inclusive && list2.inclusive) {
    // [1,2] - [2,3,4] = [1]
      return new List(_.difference(list1.items, list2.items));
    } else if (list1.inclusive && !list2.inclusive) {
    // [1,2] - ^[2,3,4] = [2]
      return new List(_.intersection(list1.items, list2.items));
    } else if (!list1.inclusive && list2.inclusive) {
    // ^[1,2] - [2,3,4] = ^[1,2,3,4]
      return new List(_.union(list1.items, list2.items), false);
    } else if (!list1.inclusive && !list2.inclusive) {
    // ^[1,2] - ^[2,3,4] = [3,4]
      return new List(_.difference(list2.items, list1.items));
    }

    // unreachable
    return new List();
  }

  /**
 * @param {List|array} list1
 * @param {List|array} list2
 * @return {List}
 */
  static union(list1, list2) {
    list1 = List.from(list1);
    list2 = List.from(list2);

    if (list1.inclusive && list2.inclusive) {
    // [1,2] + [2,3,4] = [1,2,3,4]
      return new List(_.union(list1.items, list2.items));
    } else if (list1.inclusive && !list2.inclusive) {
    // [1,2] + ^[2,3,4] = ^[3,4]
      return new List(_.difference(list2.items, list1.items), false);
    } else if (!list1.inclusive && list2.inclusive) {
    // ^[1,2] + [2,3,4] = ^[1]
      return new List(_.difference(list1.items, list2.items), false);
    } else if (!list1.inclusive && !list2.inclusive) {
    // ^[1,2] + ^[2,3,4] = ^[2]
      return new List(_.intersection(list2.items, list1.items), false);
    }

    // unreachable
    return new List();
  }

  /**
 * @param {List|array} list1
 * @param {List|array} list2
 * @return {List}
 */
  static intersection(list1, list2) {
    list1 = List.from(list1);
    list2 = List.from(list2);

    if (list1.inclusive && list2.inclusive) {
    // [1,2] & [2,3,4] = [2]
      return new List(_.intersection(list1.items, list2.items));
    } else if (list1.inclusive && !list2.inclusive) {
    // [1,2] & ^[2,3,4] = [1]
      return new List(_.difference(list1.items, list2.items));
    } else if (!list1.inclusive && list2.inclusive) {
    // ^[1,2] & [2,3,4] = [3,4]
      return new List(_.difference(list2.items, list1.items));
    } else if (!list1.inclusive && !list2.inclusive) {
    // ^[1,2] & ^[2,3,4] = ^[1,2,3,4]
      return new List(_.union(list1.items, list2.items), false);
    }

    // unreachable
    return new List();
  }

  /**
   * @param {List|array} list1
   * @param {List|array} list2
   * @return {boolean}
   */
  static equal(list1, list2) {
    list1 = List.from(list1);
    list2 = List.from(list2);

    return List.difference(list1, list2).isEmpty() && List.difference(list2, list1).isEmpty();
  }
}
