#include "./include/CardColorTransform.h"
#include <jsoncons/json.hpp>

// Fast card-color simplification / gradient-removal algorithm.
//
// Goal: take a photo of a coloured card (loyalty card, ID card, playing card,
//       etc.) that has lighting gradients, reflections or slight colour
//       variations and produce a clean, flat-colour version suitable for display
//       (e.g. in a card-wallet app).
//
// Algorithm overview:
//   1. Optionally apply bilateral filtering on a downscaled copy of the image
//      (for speed) and scale the result back.  The bilateral filter is edge-
//      preserving: it smooths colour gradients within a uniform region without
//      blurring the boundary between regions.  Multiple passes are supported for
//      stronger gradient removal.
//   2. Downsample the smoothed image further for k-means (fast cluster search).
//   3. Convert to CIE L*a*b* (perceptually uniform) colour space.
//   4. Run k-means clustering to find the nbColors dominant palette entries.
//   5. Map every pixel of the full-resolution smoothed image to the nearest
//      palette entry using a fast per-row integer loop.
//   6. Optionally boost saturation of the quantised result via a 1-D LUT.
//
// Performance notes:
//   * The bilateral filter is applied to a copy resized to ≤ bilateralMaxDim px
//     on its longest side, so even very large photos are processed quickly.
//   * K-means runs on a copy resized to ≤ kmeansMaxDim px, keeping iteration
//     cost low regardless of the input resolution.
//   * The final pixel-assignment loop uses direct row pointers (no at<>() call)
//     and integer arithmetic for maximum throughput.

static const int kBilateralMaxDim = 1500;
static const int kKmeansMaxDim    = 300;

void cardColorTransform(const cv::Mat &img, cv::Mat &dst, const CardColorOptions &options)
{
    CardColorOptions o = options;
    o.nbColors              = std::max(1, std::min(20, o.nbColors));
    o.bilateralD            = std::max(0, std::min(25, o.bilateralD));
    o.bilateralSigmaColor   = std::max(1.0, std::min(250.0, o.bilateralSigmaColor));
    o.bilateralSigmaSpace   = std::max(1.0, std::min(250.0, o.bilateralSigmaSpace));
    o.bilateralIterations   = std::max(1, std::min(5, o.bilateralIterations));
    o.saturationBoost       = std::max(0.0, std::min(4.0, o.saturationBoost));

    // -- Step 1: Bilateral filtering for gradient removal --
    cv::Mat smoothed;
    if (o.bilateralD > 0)
    {
        // Optionally downsample for speed, then upsample the result back.
        int maxDim = std::max(img.rows, img.cols);
        cv::Mat workImg;
        double scale = 1.0;
        if (maxDim > kBilateralMaxDim)
        {
            scale = static_cast<double>(kBilateralMaxDim) / maxDim;
            cv::resize(img, workImg, cv::Size(), scale, scale, cv::INTER_AREA);
        }
        else
        {
            workImg = img.clone();
        }

        for (int iter = 0; iter < o.bilateralIterations; ++iter)
        {
            cv::Mat temp;
            cv::bilateralFilter(workImg, temp, o.bilateralD,
                                o.bilateralSigmaColor, o.bilateralSigmaSpace);
            workImg = temp;
        }

        if (scale < 1.0)
            cv::resize(workImg, smoothed, img.size(), 0.0, 0.0, cv::INTER_LINEAR);
        else
            smoothed = workImg;
    }
    else
    {
        smoothed = img.clone();
    }

    // -- Step 2: Downsample for k-means palette extraction --
    cv::Mat small;
    {
        int maxDim = std::max(smoothed.rows, smoothed.cols);
        if (maxDim > kKmeansMaxDim)
        {
            double scale = static_cast<double>(kKmeansMaxDim) / maxDim;
            cv::resize(smoothed, small, cv::Size(), scale, scale, cv::INTER_AREA);
        }
        else
        {
            small = smoothed.clone();
        }
    }

    // -- Step 3: Convert to L*a*b* for perceptually uniform distances --
    cv::Mat smallLab;
    cv::cvtColor(small, smallLab, cv::COLOR_BGR2Lab);

    // -- Step 4: K-means clustering to find dominant palette --
    const int nPix = small.rows * small.cols;
    cv::Mat data = smallLab.reshape(1, nPix); // nPix × 3
    data.convertTo(data, CV_32F);

    cv::Mat labels, centers;
    cv::TermCriteria criteria(cv::TermCriteria::EPS + cv::TermCriteria::COUNT, 10, 1.0);
    cv::kmeans(data, o.nbColors, labels, criteria, 3, cv::KMEANS_PP_CENTERS, centers);

    // Convert float Lab centers to uchar Lab
    cv::Mat centersLab;
    centers.convertTo(centersLab, CV_8U);

    // Pre-compute BGR values for each center (for fast output reconstruction)
    std::vector<cv::Vec3b> centersBGR(o.nbColors);
    for (int k = 0; k < o.nbColors; ++k)
    {
        cv::Mat labPx(1, 1, CV_8UC3, cv::Vec3b(
            centersLab.at<uchar>(k, 0),
            centersLab.at<uchar>(k, 1),
            centersLab.at<uchar>(k, 2)));
        cv::Mat bgrPx;
        cv::cvtColor(labPx, bgrPx, cv::COLOR_Lab2BGR);
        centersBGR[k] = bgrPx.at<cv::Vec3b>(0, 0);
    }

    // Pre-cache center Lab values as integers for the distance loop
    std::vector<int> cL(o.nbColors), cA(o.nbColors), cB(o.nbColors);
    for (int k = 0; k < o.nbColors; ++k)
    {
        cL[k] = centersLab.at<uchar>(k, 0);
        cA[k] = centersLab.at<uchar>(k, 1);
        cB[k] = centersLab.at<uchar>(k, 2);
    }

    // -- Step 5: Map every pixel to the nearest palette entry --
    cv::Mat fullLab;
    cv::cvtColor(smoothed, fullLab, cv::COLOR_BGR2Lab);

    dst.create(img.rows, img.cols, CV_8UC3);

    for (int y = 0; y < fullLab.rows; ++y)
    {
        const uchar *srcRow = fullLab.ptr<uchar>(y);
        uchar       *dstRow = dst.ptr<uchar>(y);

        for (int x = 0; x < fullLab.cols; ++x)
        {
            const int l = srcRow[3 * x + 0];
            const int a = srcRow[3 * x + 1];
            const int b = srcRow[3 * x + 2];

            int minDist = INT_MAX;
            int bestK   = 0;
            for (int k = 0; k < o.nbColors; ++k)
            {
                const int dl   = l - cL[k];
                const int da   = a - cA[k];
                const int db   = b - cB[k];
                const int dist = dl * dl + da * da + db * db;
                if (dist < minDist)
                {
                    minDist = dist;
                    bestK   = k;
                }
            }

            dstRow[3 * x + 0] = centersBGR[bestK][0];
            dstRow[3 * x + 1] = centersBGR[bestK][1];
            dstRow[3 * x + 2] = centersBGR[bestK][2];
        }
    }

    // -- Step 6: Optional saturation boost via 1-D LUT --
    if (o.saturationBoost > 1.001 || o.saturationBoost < 0.999)
    {
        cv::Mat hsv;
        cv::cvtColor(dst, hsv, cv::COLOR_BGR2HSV);

        std::vector<cv::Mat> hsvCh;
        cv::split(hsv, hsvCh);

        cv::Mat satLut(1, 256, CV_8U);
        uchar *lutData = satLut.ptr<uchar>(0);
        for (int i = 0; i < 256; ++i)
            lutData[i] = static_cast<uchar>(std::min(255.0, std::round(i * o.saturationBoost)));

        cv::LUT(hsvCh[1], satLut, hsvCh[1]);
        cv::merge(hsvCh, hsv);
        cv::cvtColor(hsv, dst, cv::COLOR_HSV2BGR);
    }
}

void cardColorTransform(const cv::Mat &img, cv::Mat &dst, const std::string &optionsJson)
{
    CardColorOptions options;

    if (!optionsJson.empty())
    {
        try
        {
            jsoncons::json j = jsoncons::json::parse(optionsJson);
            if (j.contains("nbColors"))
                options.nbColors = j["nbColors"].as<int>();
            if (j.contains("bilateralD"))
                options.bilateralD = j["bilateralD"].as<int>();
            if (j.contains("bilateralSigmaColor"))
                options.bilateralSigmaColor = j["bilateralSigmaColor"].as<double>();
            if (j.contains("bilateralSigmaSpace"))
                options.bilateralSigmaSpace = j["bilateralSigmaSpace"].as<double>();
            if (j.contains("bilateralIterations"))
                options.bilateralIterations = j["bilateralIterations"].as<int>();
            if (j.contains("saturationBoost"))
                options.saturationBoost = j["saturationBoost"].as<double>();
        }
        catch (const std::exception &) { /* use defaults on malformed JSON */ }
    }

    cardColorTransform(img, dst, options);
}
