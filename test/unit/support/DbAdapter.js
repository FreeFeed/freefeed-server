/*eslint-env node, mocha */
/*global $should */
import '../../../app/models'  // hack to fix circular dependency
import { mkKey } from '../../../app/support/DbAdapter'


describe('support/DbAdapter', () => {
  describe('mkKey()', () => {
    it('should build correct keys from correct inputs', () => {
      mkKey(['hello', 'world']).should.equal('hello:world')
      mkKey(['a', 'b', 'c', 'd']).should.equal('a:b:c:d')
    })

    it('should not take incorrect keys as input', () => {
      $should.Throw(() => mkKey(['hello', 123]), Error)
      $should.Throw(() => mkKey([null]), Error)
      $should.Throw(() => mkKey(['hi', 'strange', {}]), Error)
    })
  })
})
