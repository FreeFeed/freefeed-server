///////////////////////////////////////////////////
// Now
///////////////////////////////////////////////////

export default function nowTrait(superClass) {
  return class extends superClass {
    /**
     * Returns the current database time as ISO 8601 string
     *
     * This method exists for testing purposes, you should not use it in app code!
     */
    now() {
      return this.database.getOne('select now()');
    }
  };
}
