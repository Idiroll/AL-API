/**
 * Core nesting engine using guillotine bin-packing algorithm
 * Optimized for rectangular items with optional rotation
 */

class NestingEngine {
  constructor(options = {}) {
    this.spacing = options.spacing || 10;
    this.allowRotation = options.allowRotation || false;
    this.targetWidth = options.targetWidth || 1000;
    this.targetHeight = options.targetHeight || 1000;
  }

  /**
   * Main nesting function
   * @param {Array} items - Array of {id, width, height, originalItem}
   * @returns {Array} - Array of {id, x, y, width, height, rotated}
   */
  nest(items) {
    if (!items || items.length === 0) return [];

    // Sort items by area (largest first) for better packing
    const sortedItems = [...items].sort((a, b) => 
      (b.width * b.height) - (a.width * a.height)
    );

    // Initialize the bin packer
    const packer = new GuillouinePacker(
      this.targetWidth, 
      this.targetHeight,
      this.spacing
    );

    const placements = [];
    const unplacedItems = [];

    // Attempt to place each item
    for (const item of sortedItems) {
      let placement = null;

      // Try placing without rotation
      placement = packer.insert(item.width, item.height, item.id);

      // If failed and rotation is allowed, try rotated
      if (!placement && this.allowRotation && item.width !== item.height) {
        placement = packer.insert(item.height, item.width, item.id);
        if (placement) {
          placement.rotated = true;
        }
      }

      if (placement) {
        placements.push({
          ...placement,
          originalItem: item.originalItem,
          rotated: placement.rotated || false
        });
      } else {
        unplacedItems.push(item);
      }
    }

    // If items didn't fit, expand and retry recursively
    if (unplacedItems.length > 0 && placements.length > 0) {
      const bounds = this.calculateBounds(placements);
      const expandedWidth = Math.max(this.targetWidth, bounds.maxX + 100);
      const expandedHeight = Math.max(this.targetHeight, bounds.maxY + 100);
      
      // Create new engine with expanded dimensions
      const expandedEngine = new NestingEngine({
        spacing: this.spacing,
        allowRotation: this.allowRotation,
        targetWidth: expandedWidth,
        targetHeight: expandedHeight
      });
      
      return expandedEngine.nest(items);
    }

    return placements;
  }

  calculateBounds(placements) {
    let maxX = 0, maxY = 0;
    for (const p of placements) {
      maxX = Math.max(maxX, p.x + p.width);
      maxY = Math.max(maxY, p.y + p.height);
    }
    return { maxX, maxY };
  }
}

/**
 * Guillotine bin packing algorithm
 * Efficient for rectangular items
 */
class GuillouinePacker {
  constructor(width, height, spacing = 0) {
    this.binWidth = width;
    this.binHeight = height;
    this.spacing = spacing;
    this.freeRectangles = [{ x: 0, y: 0, width, height }];
  }

  insert(width, height, id) {
    // Add spacing to dimensions
    const w = width + this.spacing;
    const h = height + this.spacing;

    // Find best rectangle using best short side fit
    let bestRect = null;
    let bestIndex = -1;
    let bestShortSideFit = Infinity;

    for (let i = 0; i < this.freeRectangles.length; i++) {
      const rect = this.freeRectangles[i];
      
      if (w <= rect.width && h <= rect.height) {
        const leftoverHoriz = rect.width - w;
        const leftoverVert = rect.height - h;
        const shortSideFit = Math.min(leftoverHoriz, leftoverVert);

        if (shortSideFit < bestShortSideFit) {
          bestRect = rect;
          bestIndex = i;
          bestShortSideFit = shortSideFit;
        }
      }
    }

    if (!bestRect) return null;

    // Place item in best rectangle
    const placement = {
      id,
      x: bestRect.x,
      y: bestRect.y,
      width,
      height
    };

    // Split remaining space using guillotine cuts
    this.splitFreeNode(bestRect, w, h, bestIndex);

    return placement;
  }

  splitFreeNode(freeRect, usedWidth, usedHeight, index) {
    // Remove used rectangle
    this.freeRectangles.splice(index, 1);

    // Create new free rectangles from remaining space
    const rightWidth = freeRect.width - usedWidth;
    const bottomHeight = freeRect.height - usedHeight;

    // Decide split axis (prefer shorter split)
    if (rightWidth > 0) {
      this.freeRectangles.push({
        x: freeRect.x + usedWidth,
        y: freeRect.y,
        width: rightWidth,
        height: freeRect.height
      });
    }

    if (bottomHeight > 0) {
      this.freeRectangles.push({
        x: freeRect.x,
        y: freeRect.y + usedHeight,
        width: usedWidth,
        height: bottomHeight
      });
    }

    // Merge adjacent rectangles (optimization)
    this.mergeRectangles();
  }

  mergeRectangles() {
    // Simple merge: remove rectangles contained within others
    this.freeRectangles = this.freeRectangles.filter((rect, i) => {
      for (let j = 0; j < this.freeRectangles.length; j++) {
        if (i === j) continue;
        const other = this.freeRectangles[j];
        if (this.isContained(rect, other)) {
          return false;
        }
      }
      return true;
    });
  }

  isContained(rect, container) {
    return rect.x >= container.x &&
           rect.y >= container.y &&
           rect.x + rect.width <= container.x + container.width &&
           rect.y + rect.height <= container.y + container.height;
  }
}

export { NestingEngine, GuillouinePacker };
