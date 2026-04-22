#ifndef DOCUMENT_SHARPEN_H
#define DOCUMENT_SHARPEN_H

#include <opencv2/opencv.hpp>

struct SharpenOptions {
    double amount = 1.5;   // Sharpening strength: 0.0 = no effect, 4.0 = very strong
    int radius = 1;        // Blur radius used for the unsharp mask (kernel = 2*radius+1)
    int threshold = 0;     // Min per-channel difference to apply sharpening (0 = always apply)
};

void sharpenTransform(const cv::Mat &img, cv::Mat &dst, const std::string &optionsJson);
void sharpenTransform(const cv::Mat &img, cv::Mat &dst, const SharpenOptions &options);

#endif // DOCUMENT_SHARPEN_H
