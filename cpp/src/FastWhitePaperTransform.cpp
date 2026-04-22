#include "./include/FastWhitePaperTransform.h"
#include <jsoncons/json.hpp>

// Fast whitepaper / shadow-removal algorithm.
//
// Goal: make white-paper documents look clean (white background, sharp text)
//       while keeping strong colors (colored markers, photos, etc.).
//
// Algorithm overview:
//   1. Convert BGR -> HSV (8-bit).
//   2. Build a "background illumination" map by applying a large morphological
//      dilation to the Value (V) channel.  Dilation replaces each pixel with the
//      local maximum, which effectively lifts dark text/lines out of the estimate
//      and leaves only the slowly-varying paper-brightness.
//   3. Divide the V channel by the background map (float arithmetic) and scale
//      the result to [0, 255].  This removes shadows and uneven lighting.
//   4. Blend the normalised V with the original V using `shadowStrength`.
//   5. Clip V to [0, 255] and convert back to uint8.
//   6. For "colorful" pixels (original S > colorSatThreshold) apply a `colorGain`
//      boost to S so vivid colors survive (or are emphasised).
//   7. Reconstruct the image and convert HSV -> BGR.
//
// Performance notes:
//   * The dilation uses a rectangular structuring element so OpenCV can run it
//     with an O(N) sliding-window decomposition (fast even for large kernels).
//   * All remaining operations are single-pass LUT or per-pixel arithmetic.
void fastWhitePaperTransform(const cv::Mat &img, cv::Mat &dst, const FastWhitePaperOptions &options)
{
    FastWhitePaperOptions o = options;
    // Clamp / sanitise parameters
    o.shadowStrength    = std::max(0.0, std::min(1.0, o.shadowStrength));
    o.colorGain         = std::max(0.0, std::min(4.0, o.colorGain));
    o.colorSatThreshold = std::max(0, std::min(255, o.colorSatThreshold));
    if (o.bgKernelSize < 3) o.bgKernelSize = 3;
    if (o.bgKernelSize % 2 == 0) o.bgKernelSize += 1; // must be odd

    // -- Step 1: Convert to HSV --
    cv::Mat hsv;
    cv::cvtColor(img, hsv, cv::COLOR_BGR2HSV);

    std::vector<cv::Mat> hsvChannels;
    cv::split(hsv, hsvChannels);
    // hsvChannels[0] = H, [1] = S, [2] = V   (all CV_8U, range 0-255)

    cv::Mat &V = hsvChannels[2];
    cv::Mat &S = hsvChannels[1];

    // -- Step 2: Estimate background illumination via morphological dilation --
    // A rectangle element is faster than ELLIPSE and gives near-identical results
    // for this application.
    cv::Mat background;
    const cv::Mat kernel = cv::getStructuringElement(
        cv::MORPH_RECT,
        cv::Size(o.bgKernelSize, o.bgKernelSize));
    cv::dilate(V, background, kernel);

    // -- Step 3 & 4: Normalise V and blend with original --
    cv::Mat V_float, bg_float;
    V.convertTo(V_float, CV_32F);
    background.convertTo(bg_float, CV_32F);

    // Avoid division by zero
    cv::Mat bg_safe;
    cv::max(bg_float, 1.0f, bg_safe);

    // normalised_V in [0, 255]
    cv::Mat V_norm = (V_float / bg_safe) * 255.0f;

    // Blend: new_V = original_V*(1-strength) + normalised_V*strength
    cv::Mat V_blend;
    cv::addWeighted(V_float, 1.0 - o.shadowStrength,
                    V_norm,  o.shadowStrength, 0.0, V_blend);

    // -- Step 5: Clip and convert back to uint8 --
    cv::Mat V_new;
    V_blend.convertTo(V_new, CV_8U, 1.0, 0.5); // round to nearest

    // -- Step 6: Apply colorGain to saturated pixels --
    // We use a LUT for the saturation boost so it stays O(N).
    if (std::abs(o.colorGain - 1.0) > 1e-3 && o.colorSatThreshold < 255)
    {
        // Build a LUT that maps S -> boosted_S for values above the threshold.
        cv::Mat satLut(1, 256, CV_8U);
        uchar *lutData = satLut.ptr<uchar>(0);
        for (int i = 0; i < 256; ++i)
        {
            if (i >= o.colorSatThreshold)
            {
                double boosted = std::min(255.0, std::round(i * o.colorGain));
                lutData[i] = static_cast<uchar>(boosted);
            }
            else
            {
                lutData[i] = static_cast<uchar>(i);
            }
        }
        cv::LUT(S, satLut, S);
    }

    // -- Step 7: Reconstruct and convert HSV -> BGR --
    hsvChannels[2] = V_new;
    cv::Mat hsvResult;
    cv::merge(hsvChannels, hsvResult);
    cv::cvtColor(hsvResult, dst, cv::COLOR_HSV2BGR);
}

void fastWhitePaperTransform(const cv::Mat &img, cv::Mat &dst, const std::string &optionsJson)
{
    FastWhitePaperOptions options;

    if (!optionsJson.empty())
    {
        jsoncons::json j = jsoncons::json::parse(optionsJson);
        if (j.contains("shadowStrength"))
            options.shadowStrength = j["shadowStrength"].as<double>();
        if (j.contains("colorGain"))
            options.colorGain = j["colorGain"].as<double>();
        if (j.contains("colorSatThreshold"))
            options.colorSatThreshold = j["colorSatThreshold"].as<int>();
        if (j.contains("bgKernelSize"))
            options.bgKernelSize = j["bgKernelSize"].as<int>();
    }

    fastWhitePaperTransform(img, dst, options);
}
