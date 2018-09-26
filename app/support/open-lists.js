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

  includes(item) {
    return this.inclusive === this.items.includes(item);
  }
}

/**
 * @param {List|array} list1
 * @param {List|array} list2
 * @return {List}
 */
export function difference(list1, list2) {
  if (Array.isArray(list1)) {
    list1 = new List(list1);
  }
  if (Array.isArray(list2)) {
    list2 = new List(list2);
  }

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
export function union(list1, list2) {
  if (Array.isArray(list1)) {
    list1 = new List(list1);
  }
  if (Array.isArray(list2)) {
    list2 = new List(list2);
  }

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
    return new List(_.intersection(list2.items, list1.items), true);
  }
  // unreachable
  return new List();
}

/**
 * @param {List|array} list1
 * @param {List|array} list2
 * @return {List}
 */
export function intersection(list1, list2) {
  if (Array.isArray(list1)) {
    list1 = new List(list1);
  }
  if (Array.isArray(list2)) {
    list2 = new List(list2);
  }

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
    return new List(_.union(list2.items, list1.items), true);
  }
  // unreachable
  return new List();
}
