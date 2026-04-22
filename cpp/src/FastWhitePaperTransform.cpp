#include "./include/FastWhitePaperTransform.h"
#include "./include/SharpenTransform.h"
#include <jsoncons/json.hpp>

// Improved fast whitepaper / shadow-removal algorithm.
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
//   5. Contrast-stretch the blended V channel: clip the darkest stretchBlackPct%
//      of pixels to black and the brightest stretchWhitePct% to white, then
//      linearly rescale to [0,255].  This is what makes backgrounds truly white.
//   6. Apply a saturation boost to colorful pixels via a 1-D LUT.
//   7. Reconstruct the image and convert HSV -> BGR.
//   8. Optionally sharpen the result with an unsharp mask.
//
// Performance notes:
//   * The dilation uses a rectangular structuring element so OpenCV can run it
//     with an O(N) sliding-window decomposition (fast even for large kernels).
//   * The contrast stretch uses a 256-entry histogram and a 256-entry LUT: O(N).
//   * All remaining operations are single-pass LUT or per-pixel arithmetic.
void fastWhitePaperTransform(const cv::Mat &img, cv::Mat &dst, const FastWhitePaperOptions &options)
{
    FastWhitePaperOptions o = options;
    // Clamp / sanitise parameters
    o.shadowStrength    = std::max(0.0, std::min(1.0, o.shadowStrength));
    o.colorGain         = std::max(0.0, std::min(4.0, o.colorGain));
    o.colorSatThreshold = std::max(0, std::min(255, o.colorSatThreshold));
    o.stretchBlackPct   = std::max(0, std::min(49, o.stretchBlackPct));
    o.stretchWhitePct   = std::max(0, std::min(49, o.stretchWhitePct));
    o.sharpenAmount     = std::max(0.0, std::min(4.0, o.sharpenAmount));
    o.sharpenRadius     = std::max(1, std::min(10, o.sharpenRadius));
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
    cv::Mat background;
    const cv::Mat kernel = cv::getStructuringElement(
        cv::MORPH_RECT,
        cv::Size(o.bgKernelSize, o.bgKernelSize));
    cv::dilate(V, background, kernel);

    // -- Step 3 & 4: Normalise V and blend with original --
    cv::Mat V_float, bg_float;
    V.convertTo(V_float, CV_32F);
    background.convertTo(bg_float, CV_32F);

    cv::Mat bg_safe;
    cv::max(bg_float, 1.0f, bg_safe);

    cv::Mat V_norm = (V_float / bg_safe) * 255.0f;

    cv::Mat V_blend;
    cv::addWeighted(V_float, 1.0 - o.shadowStrength,
                    V_norm,  o.shadowStrength, 0.0, V_blend);

    // -- Step 5: Convert to uint8 then contrast-stretch --
    cv::Mat V_8u;
    V_blend.convertTo(V_8u, CV_8U, 1.0, 0.5);

    if (o.stretchBlackPct > 0 || o.stretchWhitePct > 0)
    {
        // Compute 256-bin histogram of the V channel
        cv::Mat hist;
        cv::calcHist(std::vector<cv::Mat>{V_8u}, {0}, cv::Mat(), hist, {256}, {0, 256});

        const int totPix  = V_8u.rows * V_8u.cols;
        const int blackCount = totPix * o.stretchBlackPct / 100;
        const int whiteCount = totPix * o.stretchWhitePct / 100;

        // Find black point (lower percentile)
        int blackInd = 0;
        {
            int co = 0;
            for (int i = 0; i < 256; ++i)
            {
                co += static_cast<int>(hist.at<float>(i));
                if (co > blackCount) { blackInd = i; break; }
            }
        }

        // Find white point (upper percentile)
        int whiteInd = 255;
        {
            int co = 0;
            for (int i = 255; i >= 0; --i)
            {
                co += static_cast<int>(hist.at<float>(i));
                if (co > whiteCount) { whiteInd = i; break; }
            }
        }

        // Build stretch LUT
        if (whiteInd > blackInd)
        {
            cv::Mat stretchLut(1, 256, CV_8U);
            uchar *lutData = stretchLut.ptr<uchar>(0);
            const double scale = 255.0 / (whiteInd - blackInd);
            for (int i = 0; i < 256; ++i)
            {
                if (i <= blackInd)
                    lutData[i] = 0;
                else if (i >= whiteInd)
                    lutData[i] = 255;
                else
                    lutData[i] = static_cast<uchar>((i - blackInd) * scale + 0.5);
            }
            cv::LUT(V_8u, stretchLut, V_8u);
        }
    }

    // -- Step 6: Apply colorGain to saturated pixels (1-D LUT, O(N)) --
    if (std::abs(o.colorGain - 1.0) > 1e-3 && o.colorSatThreshold < 255)
    {
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
    hsvChannels[2] = V_8u;
    cv::Mat hsvResult;
    cv::merge(hsvChannels, hsvResult);
    cv::cvtColor(hsvResult, dst, cv::COLOR_HSV2BGR);

    // -- Step 8: Optional unsharp-mask sharpening --
    if (o.sharpenAmount > 1e-3)
    {
        SharpenOptions sh;
        sh.amount    = o.sharpenAmount;
        sh.radius    = o.sharpenRadius;
        sh.threshold = 0;
        sharpenTransform(dst, dst, sh);
    }
}

void fastWhitePaperTransform(const cv::Mat &img, cv::Mat &dst, const std::string &optionsJson)
{
    FastWhitePaperOptions options;

    if (!optionsJson.empty())
    {
        try
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
            if (j.contains("stretchBlackPct"))
                options.stretchBlackPct = j["stretchBlackPct"].as<int>();
            if (j.contains("stretchWhitePct"))
                options.stretchWhitePct = j["stretchWhitePct"].as<int>();
            if (j.contains("sharpenAmount"))
                options.sharpenAmount = j["sharpenAmount"].as<double>();
            if (j.contains("sharpenRadius"))
                options.sharpenRadius = j["sharpenRadius"].as<int>();
        }
        catch (const std::exception &) { /* use defaults on malformed JSON */ }
    }

    fastWhitePaperTransform(img, dst, options);
}
