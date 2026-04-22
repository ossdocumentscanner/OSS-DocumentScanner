#include "./include/SharpenTransform.h"
#include <jsoncons/json.hpp>

// Fast unsharp-mask sharpening.
//
// Algorithm:
//   1. Gaussian-blur the source with a small kernel.
//   2. Blend original and blurred: dst = (1+amount)*src - amount*blurred
//      which is equivalent to: dst = src + amount*(src - blurred)
//   3. Optional threshold: only sharpen pixels where |src - blurred| > threshold.
//
// This is O(N) in practice because cv::GaussianBlur uses a separable filter.
void sharpenTransform(const cv::Mat &img, cv::Mat &dst, const SharpenOptions &options)
{
    SharpenOptions o = options;
    // Clamp parameters to safe ranges
    o.radius    = std::max(1, o.radius);
    o.amount    = std::max(0.0, o.amount);
    o.threshold = std::max(0, std::min(255, o.threshold));

    const int kSize = 2 * o.radius + 1;

    // Blur with sigma proportional to radius for a natural look
    const double sigma = 0.3 * (o.radius - 1) + 0.8; // OpenCV default formula
    cv::Mat blurred;
    cv::GaussianBlur(img, blurred, cv::Size(kSize, kSize), sigma);

    if (o.threshold == 0)
    {
        // Simple unsharp mask: dst = (1+amount)*img - amount*blurred
        cv::addWeighted(img, 1.0 + o.amount, blurred, -o.amount, 0.0, dst);
    }
    else
    {
        // Threshold-based: only sharpen where the high-frequency detail exceeds threshold.
        cv::Mat sharpened;
        cv::addWeighted(img, 1.0 + o.amount, blurred, -o.amount, 0.0, sharpened);

        // Build a per-pixel mask: apply sharpening only where |img - blurred| > threshold
        cv::Mat diff;
        cv::absdiff(img, blurred, diff);

        // For multi-channel images take the max across channels
        cv::Mat mask;
        if (diff.channels() > 1)
        {
            std::vector<cv::Mat> channels;
            cv::split(diff, channels);
            mask = channels[0].clone();
            for (size_t c = 1; c < channels.size(); ++c)
                cv::max(mask, channels[c], mask);
        }
        else
        {
            mask = diff;
        }

        cv::threshold(mask, mask, o.threshold, 255, cv::THRESH_BINARY);

        // Compose result: where mask==255 use sharpened, otherwise use original
        img.copyTo(dst);
        sharpened.copyTo(dst, mask);
    }
}

void sharpenTransform(const cv::Mat &img, cv::Mat &dst, const std::string &optionsJson)
{
    SharpenOptions options;

    if (!optionsJson.empty())
    {
        jsoncons::json j = jsoncons::json::parse(optionsJson);
        if (j.contains("amount"))
            options.amount = j["amount"].as<double>();
        if (j.contains("radius"))
            options.radius = j["radius"].as<int>();
        if (j.contains("threshold"))
            options.threshold = j["threshold"].as<int>();
    }

    sharpenTransform(img, dst, options);
}
