/**
 * Apply calculated nesting positions to Illustrator items
 * Handles coordinate transformation and batch updates
 */

class LayoutApplier {
  constructor(options = {}) {
    this.animationDuration = options.animationDuration || 0; // Future: animate moves
    this.undoGroupName = options.undoGroupName || "Auto Nest Images";
  }

  /**
   * Apply nesting layout to images
   * @param {Array} placements - Array from nesting engine
   * @param {Object} options - Application options
   */
  async applyLayout(placements, options = {}) {
    if (!placements || placements.length === 0) {
      throw new Error("No placements to apply");
    }

    const {
      artboardIndex = null,
      anchorPoint = "TOP_LEFT", // TOP_LEFT, CENTER, etc.
      offsetX = 0,
      offsetY = 0
    } = options;

    // Get document and artboard reference
    const doc = app.activeDocument;
    if (!doc) throw new Error("No active document");

    let targetArtboard = null;
    let baseX = offsetX;
    let baseY = offsetY;

    if (artboardIndex !== null && doc.artboards[artboardIndex]) {
      targetArtboard = doc.artboards[artboardIndex];
      const abBounds = targetArtboard.artboardRect;
      baseX += abBounds[0]; // Left edge of artboard
      baseY += abBounds[1]; // Top edge of artboard (inverted Y)
    }

    // Begin undo group for batch operation
    doc.selection = null; // Deselect all

    try {
      // Process placements in batches for performance
      const batchSize = 50;
      for (let i = 0; i < placements.length; i += batchSize) {
        const batch = placements.slice(i, i + batchSize);
        await this.processBatch(batch, baseX, baseY);
      }

      console.log(`Successfully repositioned ${placements.length} images`);
      return {
        success: true,
        count: placements.length
      };

    } catch (error) {
      console.error("Error applying layout:", error);
      throw error;
    }
  }

  /**
   * Process a batch of placements
   */
  async processBatch(placements, baseX, baseY) {
    for (const placement of placements) {
      const item = placement.originalItem;
      if (!item) continue;

      // Calculate new position
      const newLeft = baseX + placement.x;
      const newTop = baseY - placement.y; // Invert Y-axis

      // Apply rotation if needed
      if (placement.rotated) {
        this.rotateItem(item, 90);
      }

      // Move item to new position
      this.moveItem(item, newLeft, newTop);

      // Optional: Update item name with position
      if (item.name) {
        item.note = `Nested at (${Math.round(placement.x)}, ${Math.round(placement.y)})`;
      }
    }
  }

  /**
   * Move item to specific coordinates
   * Uses top-left corner as reference
   */
  moveItem(item, newLeft, newTop) {
    try {
      // Get current bounds
      const currentBounds = item.geometricBounds;
      const currentLeft = currentBounds[0];
      const currentTop = currentBounds[1];

      // Calculate delta
      const deltaX = newLeft - currentLeft;
      const deltaY = newTop - currentTop;

      // Apply translation
      item.translate(deltaX, deltaY);

    } catch (error) {
      console.error(`Error moving item: ${error.message}`);
    }
  }

  /**
   * Rotate item around its center
   */
  rotateItem(item, degrees) {
    try {
      // Get center point
      const bounds = item.geometricBounds;
      const centerX = (bounds[0] + bounds[2]) / 2;
      const centerY = (bounds[1] + bounds[3]) / 2;

      // Rotate around center
      item.rotate(
        degrees,
        true, // changePositions
        true, // changeFillPatterns
        true, // changeFillGradients
        true, // changeStrokePattern
        degrees, // rotateAngle
        Transformation.CENTER // transformation anchor
      );

    } catch (error) {
      console.error(`Error rotating item: ${error.message}`);
      // Fallback: just update rotation property
      item.rotation = (item.rotation || 0) + degrees;
    }
  }

  /**
   * Validate placement before applying
   */
  validatePlacement(placement) {
    return placement &&
           placement.originalItem &&
           typeof placement.x === 'number' &&
           typeof placement.y === 'number' &&
           !isNaN(placement.x) &&
           !isNaN(placement.y);
  }

  /**
   * Create visual preview of layout (optional)
   */
  createPreview(placements, baseX, baseY) {
    const doc = app.activeDocument;
    const previewLayer = doc.layers.add();
    previewLayer.name = "Nesting Preview";

    for (const placement of placements) {
      // Create rectangle to show placement
      const rect = previewLayer.pathItems.rectangle(
        baseY - placement.y, // top
        baseX + placement.x, // left
        placement.width,
        placement.height
      );

      // Style as preview
      rect.filled = false;
      rect.stroked = true;
      rect.strokeColor = this.createRGBColor(0, 150, 255);
      rect.strokeWidth = 1;
      rect.strokeDashes = [5, 5]; // Dashed line
      rect.opacity = 50;
    }

    return previewLayer;
  }

  /**
   * Remove preview layer
   */
  removePreview() {
    const doc = app.activeDocument;
    for (let i = doc.layers.length - 1; i >= 0; i--) {
      if (doc.layers[i].name === "Nesting Preview") {
        doc.layers[i].remove();
      }
    }
  }

  /**
   * Helper: Create RGB color
   */
  createRGBColor(r, g, b) {
    const color = new RGBColor();
    color.red = r;
    color.green = g;
    color.blue = b;
    return color;
  }

  /**
   * Calculate actual bounds after nesting
   */
  calculateFinalBounds(placements, baseX, baseY) {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const p of placements) {
      const x = baseX + p.x;
      const y = baseY - p.y;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y - p.height);
      maxX = Math.max(maxX, x + p.width);
      maxY = Math.max(maxY, y);
    }

    return {
      left: minX,
      top: maxY,
      right: maxX,
      bottom: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }
}

export default LayoutApplier;
