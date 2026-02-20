import { RequestContext } from './request-context';

describe('RequestContext', () => {
  it('should store and retrieve values within run scope', () => {
    RequestContext.run(() => {
      RequestContext.set('foo', 123);
      expect(RequestContext.get('foo')).toBe(123);
    });
  });

  it('should isolate different runs', () => {
    RequestContext.run(() => {
      RequestContext.set('foo', 'a');
      RequestContext.run(() => {
        RequestContext.set('foo', 'b');
        expect(RequestContext.get('foo')).toBe('b');
      });
      expect(RequestContext.get('foo')).toBe('a');
    });
  });
});
