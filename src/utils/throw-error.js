// This file is used to alias optional dependencies that should fail to load
// so that the consuming library falls back to a pure JS implementation.
throw new Error('Module explicitly disabled via alias');
