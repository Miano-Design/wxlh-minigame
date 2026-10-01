/* 剧情分包（story）的入口文件。

   ⚠️ 微信小游戏的**分包根目录必须有一个 game.js**（这是平台要求，不是我们的代码）——
   缺了它编译就直接报「未找到 subpackages[0].root 对应的 game.js」，整个小游戏起不来。

   这个文件里**故意什么都不做**：分包里只有素材（12 张场景 + 6 张 Boss + 主视觉），
   没有任何逻辑。素材的加载在 `js/sc-story.js` 里：
     · 第一次要播剧情时 `wx.loadSubpackage({name:"story"})` 把它拉下来；
     · 然后逐张 `wx.createImage()` 取 `story/scene/img_scene_*.jpg` / `story/boss/img_boss_*.png`；
     · 任何一步失败都**回落程序化占位**（不黑屏、不抛错）。 */
