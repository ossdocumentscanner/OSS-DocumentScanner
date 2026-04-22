#ifndef DOCUMENT_FAST_WHITEPAPER_H
#define DOCUMENT_FAST_WHITEPAPER_H

#include <opencv2/opencv.hpp>

struct FastWhitePaperOptions {
    // How aggressively to remove shadows / lift background to white.
    // 0.0 = no effect, 1.0 = full normalization.
    double shadowStrength = 0.9;

    // Saturation multiplier applied to already-colorful pixels.
    // 1.0 = no change; >1.0 boosts colors; <1.0 mutes them.
    double colorGain = 1.3;

    // Minimum HSV saturation (0-255) for a pixel to be considered "colorful".
    // Colorful pixels get their original hue/saturation preserved.
    int colorSatThreshold = 30;

    // Kernel size for background estimation (must be odd, >= 3).
    // Larger values handle wider shadows / more uneven illumination.
    int bgKernelSize = 75;

    // Contrast stretch: percentage of darkest pixels clipped to black (0 = off).
    int stretchBlackPct = 2;

    // Contrast stretch: percentage of brightest pixels clipped to white (0 = off).
    int stretchWhitePct = 1;

    // Post-processing sharpening amount (0 = disabled, 1.0 = moderate).
    double sharpenAmount = 0.8;

    // Sharpening blur radius (kernel = 2*radius+1).
    int sharpenRadius = 1;
};

void fastWhitePaperTransform(const cv::Mat &img, cv::Mat &dst, const std::string &optionsJson);
void fastWhitePaperTransform(const cv::Mat &img, cv::Mat &dst, const FastWhitePaperOptions &options);

#endif // DOCUMENT_FAST_WHITEPAPER_H
