import { TrackManager } from './Track.js';

export class BeatmapTrackManager extends TrackManager {
  initialize(levelConfig, beatmap) {
    this.clear();
    this.levelConfig = levelConfig;
    this.beatmap = beatmap;
    this.beatmapIndex = 0;
    this.availableTypes = levelConfig.trackTypes;
    this.pathColor = null;
    this.blocksSinceLastStraight = 0;

    const firstColor = this.randomColor();
    this.pathColor = firstColor.color;

    // 第一个轨道在 z=0，对应第一个重音
    const segColor = { key: null, color: this.pathColor };
    this.segments.push(this.createSegment(beatmap.segmentTypes[0], 0, segColor));

    let currentZ = this.segmentLength + this.segmentGap;

    // 循环生成剩余的轨道
    for (let i = 1; i < beatmap.segmentTypes.length; i++) {
      const type = beatmap.segmentTypes[i];
      const spacing = beatmap.spacing[i - 1];

      let color;
      if (type === 'straight') {
        color = this.randomColor();
        this.pathColor = color.color;
      } else {
        color = { key: null, color: this.pathColor };
      }

      this.segments.push(this.createSegment(type, -currentZ, color));
      currentZ += spacing;
    }
  }

  recycleSegment(index, newZ) {
    // Beatmap模式：不回收，轨道数量固定
    return null;
  }
}
