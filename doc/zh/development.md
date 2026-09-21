# 开发

[文档目录](README.md)

```sh
./pnpmw install --frozen-lockfile
WISH_UPSTREAM=http://127.0.0.1:9780 ./pnpmw dev
./pnpmw typecheck
./pnpmw build
node --test tools/*.test.mjs
node tools/selftest-api.mjs http://127.0.0.1:8790
```

后端外部黑盒检查位于 wish-test/tests/test_wish_server.py，在 wish-test 目录运行 `python3 -m unittest tests.test_wish_server -v`。检查使用临时数据库和本地模拟上游，不添加 Rust 内部测试。

浏览器打开 `/#/selftest?auto=1` 可运行只读自检。需要修改会话的回归应使用临时服务，避免污染真实会话。
