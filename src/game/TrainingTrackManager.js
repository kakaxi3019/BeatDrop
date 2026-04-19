import { TrackManager } from './Track.js';

export class TrainingTrackManager extends TrackManager {
  initialize(levelConfig) {
    this.clear();
    this.levelConfig = levelConfig;
    this.availableTypes = levelConfig.trackTypes;
    this.pathColor = null;
    this.blocksSinceLastStraight = 0;

    const firstColor = this.randomColor();
    this.pathColor = firstColor.color;

    // 初始生成10个轨道
    this.segments.push(this.createSegment('straight', 0, firstColor));
    let currentZ = this.segmentLength + this.segmentGap;
    for (let i = 1; i < 10; i++) {
      const type = this.selectNextSegmentType();
      let segColor;
      if (type === 'straight') {
        segColor = this.randomColor();
        this.pathColor = segColor.color;
      } else {
        segColor = { key: null, color: this.pathColor };
      }
      this.segments.push(this.createSegment(type, -currentZ, segColor));
      currentZ += this.segmentLength + this.segmentGap;
    }
    this.lastGeneratedZ = -currentZ;
  }

  recycleSegment(index, newZ) {
    const oldSeg = this.segments[index];
    oldSeg.dispose();

    const type = this.selectNextSegmentType();
    let color;
    if (type === 'straight') {
      color = this.randomColor();
      this.pathColor = color.color;
    } else {
      color = { key: null, color: this.pathColor };
    }
    const newSeg = this.createSegment(type, newZ, color);
    newSeg.landed = false;
    this.segments[index] = newSeg;
    this.lastGeneratedZ = newZ;
    return newSeg;
  }
}
