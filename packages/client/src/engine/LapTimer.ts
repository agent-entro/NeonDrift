/**
 * Lap timing system for NeonDrift.
 * Detects lap crossings via track segment index progression.
 */
export class LapTimer {
  private _totalLaps: number;
  private _segmentCount: number;

  private _currentLap: number = 1;
  private _lapTimes: number[] = [];
  private _isFinished: boolean = false;

  private _raceStartTime: number;
  private _lapStartTime: number;

  private _prevSegmentIdx: number = 0;
  private _hasLeftStart: boolean = false;

  onLapComplete: ((lapNumber: number, lapTimeMs: number) => void) | null = null;
  onRaceComplete: ((totalTimeMs: number, lapTimesMs: number[]) => void) | null = null;

  constructor(totalLaps: number, segmentCount: number) {
    this._totalLaps = totalLaps;
    this._segmentCount = segmentCount;

    const now = performance.now();
    this._raceStartTime = now;
    this._lapStartTime = now;
  }

  /**
   * Call once per frame with the nearest segment index to the car.
   */
  update(segmentIdx: number): void {
    if (this._isFinished) return;

    // Check if car has left the start zone
    if (!this._hasLeftStart && segmentIdx > this._segmentCount * 0.15) {
      this._hasLeftStart = true;
    }

    // Detect lap wrap-around: was near end, now near start
    const nearEnd = this._prevSegmentIdx >= this._segmentCount * 0.9;
    const nearStart = segmentIdx < this._segmentCount * 0.1;

    if (nearEnd && nearStart && this._hasLeftStart) {
      // Lap completed
      const now = performance.now();
      const lapTimeMs = now - this._lapStartTime;
      this._lapTimes.push(lapTimeMs);

      if (this.onLapComplete) {
        this.onLapComplete(this._currentLap, lapTimeMs);
      }

      this._currentLap++;
      this._lapStartTime = now;
      this._hasLeftStart = false;

      if (this._currentLap > this._totalLaps) {
        this._isFinished = true;
        if (this.onRaceComplete) {
          const totalTimeMs = now - this._raceStartTime;
          this.onRaceComplete(totalTimeMs, [...this._lapTimes]);
        }
      }
    }

    this._prevSegmentIdx = segmentIdx;
  }

  get currentLap(): number {
    return this._currentLap;
  }

  get lapTimes(): number[] {
    return this._lapTimes;
  }

  get isFinished(): boolean {
    return this._isFinished;
  }

  get totalElapsed(): number {
    return performance.now() - this._raceStartTime;
  }

  get currentLapElapsed(): number {
    return performance.now() - this._lapStartTime;
  }
}
