/**
 * Image collection and bounding box analysis
 * Works with Illustrator's UXP API
 */

const { app } = require("photoshop").app;

class ImageCollector {
  /**
   * Collect all raster items from the active document
   * @param {Object} options - Collection options
   * @returns {Promise<Array>} Array of image data
   */
  async collectImages(options = {}) {
    const doc = app.activeDocument;
    if (!doc) {
      throw new Error("No active document");
    }

    const {
      selectedOnly = false,
      artboardIndex = null,
      includeLinked = true,
      includeEmbedded = true
    } = options;

    const images = [];
    const items = selectedOnly ? this.getSelectedItems(doc) : this.getAllItems(doc);

    for (const item of items) {
      // Check if item is a raster/placed image
      if (this.isImageItem(item)) {
        const imageData = await this.extractImageData(item);
        
        // Filter by artboard if specified
        if (artboardIndex !== null) {
          const artboard = doc.artboards[artboardIndex];
          if (!this.isItemInArtboard(imageData, artboard)) {
            continue;
          }
        }

        images.push(imageData);
      }
    }

    return images;
  }

  /**
   * Get all page items recursively
   */
  getAllItems(doc) {
    const items = [];
    
    function traverse(container) {
      for (let i = 0; i < container.pageItems.length; i++) {
        const item = container.pageItems[i];
        items.push(item);
        
        // Recursively check groups
        if (item.typename === "GroupItem") {
          traverse(item);
        }
      }
    }

    for (let i = 0; i < doc.layers.length; i++) {
      const layer = doc.layers[i];
      if (!layer.locked && layer.visible) {
        traverse(layer);
      }
    }

    return items;
  }

  /**
   * Get selected items
   */
  getSelectedItems(doc) {
    const items = [];
    if (doc.selection && doc.selection.length > 0) {
      for (let i = 0; i < doc.selection.length; i++) {
        items.push(doc.selection[i]);
      }
    }
    return items;
  }

  /**
   * Check if item is an image (raster or placed)
   */
  isImageItem(item) {
    return item.typename === "RasterItem" || 
           item.typename === "PlacedItem" ||
           item.typename === "SymbolItem";
  }

  /**
   * Extract comprehensive image data with bounding box
   */
  async extractImageData(item) {
    // Get geometric bounds [left, top, right, bottom]
    const bounds = item.geometricBounds;
    const left = bounds[0];
    const top = bounds[1];
    const right = bounds[2];
    const bottom = bounds[3];

    // Calculate dimensions (Illustrator's Y-axis is inverted)
    const width = right - left;
    const height = top - bottom;

    return {
      id: item.uuid || `item_${Date.now()}_${Math.random()}`,
      name: item.name || "Untitled",
      originalItem: item,
      
      // Current position
      left,
      top,
      right,
      bottom,
      
      // Dimensions
      width,
      height,
      
      // Center point
      centerX: left + width / 2,
      centerY: bottom + height / 2,
      
      // Type information
      typename: item.typename,
      
      // Rotation
      rotation: item.rotation || 0,
      
      // Layer info
      layer: item.layer ? item.layer.name : "Unknown",
      locked: item.locked || false,
      hidden: item.hidden || false,
      
      // Additional properties
      opacity: item.opacity || 100,
      blendMode: item.blendingMode || "Normal"
    };
  }

  /**
   * Check if item is within artboard bounds
   */
  isItemInArtboard(imageData, artboard) {
    const abBounds = artboard.artboardRect;
    const abLeft = abBounds[0];
    const abTop = abBounds[1];
    const abRight = abBounds[2];
    const abBottom = abBounds[3];

    // Check if image center is within artboard
    return imageData.centerX >= abLeft &&
           imageData.centerX <= abRight &&
           imageData.centerY >= abBottom &&
           imageData.centerY <= abTop;
  }

  /**
   * Get available artboards
   */
  getArtboards(doc) {
    const artboards = [];
    for (let i = 0; i < doc.artboards.length; i++) {
      const ab = doc.artboards[i];
      const bounds = ab.artboardRect;
      artboards.push({
        index: i,
        name: ab.name,
        bounds: bounds,
        width: bounds[2] - bounds[0],
        height: bounds[1] - bounds[3]
      });
    }
    return artboards;
  }

  /**
   * Calculate collision detection between two images
   */
  checkCollision(img1, img2, spacing = 0) {
    const padding = spacing / 2;
    return !(
      img1.right + padding < img2.left - padding ||
      img1.left - padding > img2.right + padding ||
      img1.bottom - padding > img2.top + padding ||
      img1.top + padding < img2.bottom - padding
    );
  }

  /**
   * Validate collected images
   */
  validateImages(images) {
    const valid = [];
    const invalid = [];

    for (const img of images) {
      if (img.width > 0 && img.height > 0 && !img.locked && !img.hidden) {
        valid.push(img);
      } else {
        invalid.push({
          name: img.name,
          reason: img.width <= 0 || img.height <= 0 ? "Invalid dimensions" :
                  img.locked ? "Locked" : "Hidden"
        });
      }
    }

    return { valid, invalid };
  }
}

export default ImageCollector;
