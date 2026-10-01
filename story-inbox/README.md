# 剧情素材「待接入」目录（不进包）

这里只放**审核中**的素材，`project.config.json` 的 `packOptions.ignore` 已经把本目录排除，
所以**失败素材永远不会跟着发布包走一遍**。

```
story-inbox/
  scene/   ← 12 张场景图（bio_lab.jpg … god_hall.jpg，1080×1920）
  boss/    ← 6 张 Boss 立绘（W06.png … W36.png，1024×1536 透明 PNG）
```

名字必须与 `docs/story/母版提示词-第二期视觉优化.md` §四 那张表**逐字一致**。

审核通过后由 Codex 搬到：

```
story/scene/*.jpg
story/boss/*.png
```

（`story/` 是剧情**独立分包** —— 主包不涨。）
