export const mockCommonLibraryReply = [
  'api_version', '1.0',
  'engine', 'js',
  'configuration', null,
  'name', 'libraryName',
  'pending_jobs', 0,
  'user', 'default',
];

export const mockSimpleLibraryReply = [
  'api_version', '1.0',
  'engine', 'js',
  'configuration', null,
  'functions', ['foo'],
  'keyspace_triggers', ['keyspace'],
  'cluster_functions', ['cluster'],
  'stream_triggers', ['stream'],
  'name', 'libraryName',
  'pending_jobs', 0,
  'user', 'default',
];

export const mockVerboseLibraryReply = [
  'api_version', '1.0',
  'engine', 'js',
  'configuration', null,
  'name', 'libraryName',
  'pending_jobs', 0,
  'user', 'default',
  'functions', [['name', 'function', 'description', 'description', 'is_async', 1, 'flags', ['flag1']]],
  'keyspace_triggers', [],
  'cluster_functions', ['foo', 'bar'],
  'stream_triggers', [[
    'name', 'stream', 'description', 'description', 'prefix', 'prefix', 'trim', 0, 'window', 1, 'streams', [['key', 'value']],
  ]],
];
