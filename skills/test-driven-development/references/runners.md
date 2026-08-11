# Repository-native runner selection

Load only when focused command is unclear. Prefer `test_context` output and repository documentation over this reminder.

## Priority

1. Repository wrapper or documented command: `make`, `just`, `task`, workspace script, CI helper.
2. Existing package-manager script.
3. Ecosystem runner already configured.
4. If none is clear, inspect setup or ask. Do not install a framework to satisfy process.

Start narrow, then broaden by risk:

- Single case.
- Test file or package.
- Neighboring suite.
- Repository standard checks.

## Common focused shapes

| Ecosystem | Example |
|---|---|
| JS/TS | `pnpm vitest run path/file.test.ts -t "name"`; `npm test -- path/file.test.js` |
| Python | `pytest tests/test_module.py -k test_name`; with repo wrapper such as `uv run pytest` |
| Go | `go test ./path/pkg -run '^TestName$'` |
| Rust | `cargo test test_name` |
| Ruby | `bundle exec rspec spec/path_spec.rb:42` |
| Gradle | `./gradlew test --tests 'pkg.Class.testName'` |
| Maven | `mvn -Dtest=Class#method test` |
| .NET | `dotnet test --filter 'FullyQualifiedName~Name'` |
| Elixir | `mix test test/path_test.exs:12` |
| PHP | `vendor/bin/phpunit path --filter name` |
| Swift | `swift test --filter Name` |
| Dart/Flutter | `dart test path`; `flutter test path` |

Examples are not authority. Flags differ by version and repository. `test_context` recognizes more ecosystems and reports source paths/confidence.

`test_run` executes exact selected command and records phase evidence. It never installs missing tools.
