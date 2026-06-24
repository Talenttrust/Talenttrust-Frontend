import { reportError, setErrorReporter } from '../errorReporter';

describe('errorReporter', () => {
  let consoleSpy: jest.SpyInstance;
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    setErrorReporter(null); // Reset to default reporter
    (process.env as any).NODE_ENV = 'test';
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    (process.env as any).NODE_ENV = originalEnv;
  });

  it('logs to console.error in development/test with the given context', () => {
    const error = new Error('Test development error');
    reportError(error, 'TestContext');

    expect(consoleSpy).toHaveBeenCalledWith('[TestContext]', error);
  });

  it('does not log to console.error in production (no-op)', () => {
    (process.env as any).NODE_ENV = 'production';
    const error = new Error('Test production error');
    reportError(error, 'TestContext');

    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('calls a custom injected reporter', () => {
    const mockReporter = jest.fn();
    setErrorReporter(mockReporter);

    const error = new Error('Custom error');
    reportError(error, 'CustomContext');

    expect(mockReporter).toHaveBeenCalledTimes(1);
    expect(mockReporter).toHaveBeenCalledWith(error, 'CustomContext');
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('safely handles custom reporter exceptions and logs them to console in non-production', () => {
    const buggyReporter = () => {
      throw new Error('Bug in reporter');
    };
    setErrorReporter(buggyReporter);

    const error = new Error('Reported error');
    
    // Should not throw / crash the application
    expect(() => {
      reportError(error, 'BuggyContext');
    }).not.toThrow();

    // In development/test, it should log the reporter error
    expect(consoleSpy).toHaveBeenCalledWith(
      'Error within injected error reporter:',
      expect.any(Error)
    );
  });

  it('safely handles custom reporter exceptions as no-op in production', () => {
    (process.env as any).NODE_ENV = 'production';
    const buggyReporter = () => {
      throw new Error('Bug in reporter');
    };
    setErrorReporter(buggyReporter);

    const error = new Error('Reported error');
    
    expect(() => {
      reportError(error, 'BuggyContext');
    }).not.toThrow();

    expect(consoleSpy).not.toHaveBeenCalled();
  });
});
