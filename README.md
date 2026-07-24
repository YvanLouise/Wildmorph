# 蜕野 Demo 0.1

桌面网页端 2D 俯视探索原型。玩家控制荒原幼兽探索固定地图“初生浅林”，用于验证移动、比例、碰撞、镜头和环境氛围。

## 运行

Windows 用户可以直接双击根目录中的 `启动蜕野.cmd`。脚本会自动检查依赖、启动本地服务器并打开默认浏览器；关闭启动器窗口即可停止游戏。

也可以通过命令行启动：

```powershell
npm.cmd install
npm.cmd run launch
```

生产构建与测试：

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
```

Playwright 默认使用系统已安装的 Google Chrome，以免重复下载浏览器运行时。

## 操作

- `WASD` 或方向键：八方向移动
- `Esc`：暂停或继续
- 开发模式 `F1`：显示碰撞框、FPS 与坐标
- 调试开启后 `[` / `]`：镜头缩放，`1`–`4`：传送至地图四角，`R`：回到出生点

黄狐狸源文件保留在 `art/characters/黄狐狸-1.png`，运行时缩放为 64×64；角色使用静态方向旋转和八方向平移，不添加呼吸、弹跳、拉伸或阴影。完整美术资源目录见 `art/README.md`。

背景音乐使用 `music/平静-悠然1.ogg`，进入游戏后循环播放，并随暂停、继续和返回标题同步控制。
