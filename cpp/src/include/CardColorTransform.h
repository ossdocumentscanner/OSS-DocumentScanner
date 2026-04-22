#ifndef CARD_COLOR_TRANSFORM_H
#define CARD_COLOR_TRANSFORM_H

#include <opencv2/opencv.hpp>
#include <string>

struct CardColorOptions {
    // Number of distinct output colors (palette size).
    int nbColors = 6;

    // Bilateral filter neighborhood diameter.  Set to 0 to skip filtering.
    // A value of 9 is fast and works well for gradient removal on card photos.
    int bilateralD = 9;

    // Color-space sigma for the bilateral filter.  Higher = more aggressive
    // color smoothing (more colours get merged together).
    double bilateralSigmaColor = 60.0;

    // Spatial sigma for the bilateral filter.  Higher = larger neighbourhood.
    double bilateralSigmaSpace = 60.0;

    // Number of bilateral filter passes.  More passes = smoother gradients.
    int bilateralIterations = 2;

    // Saturation multiplier applied after quantisation.
    // 1.0 = no change; > 1.0 makes colors more vivid.
    double saturationBoost = 1.2;
};

void cardColorTransform(const cv::Mat &img, cv::Mat &dst, const std::string &optionsJson);
void cardColorTransform(const cv::Mat &img, cv::Mat &dst, const CardColorOptions &options);

#endif // CARD_COLOR_TRANSFORM_H
