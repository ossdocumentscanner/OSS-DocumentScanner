# For more information about using CMake with Android Studio, read the
# documentation: https://d.android.com/studio/projects/add-native-code.html

# Sets the minimum version of CMake required to build the native library.

cmake_minimum_required(VERSION 3.14)

set(TARGET document_detector)
set(SRC_DIR ./)
set(SRC_DIR2 ./src)
set(OPENCV_LIB_DIR opencv/staticlibs/${ANDROID_ABI}/)
set(OPENCV_3RD_LIB_DIR opencv/3rdparty/libs/${ANDROID_ABI}/)
set(TESSERACT_LIB_DIR tesseract/staticlibs/${ANDROID_ABI}/)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -Wno-deprecated-anon-enum-enum-conversion")

include_directories(opencv/include
                    ./include
                    ./src/include
                    tesseract/include
                    )


link_directories(${OPENCV_LIB_DIR}
                 ${OPENCV_3RD_LIB_DIR}
                 ${TESSERACT_LIB_DIR})

# Creates and names a library, sets it as either STATIC
# or SHARED, and provides the relative paths to its source code.
# You can define multiple libraries, and CMake builds them for you.
# Gradle automatically packages shared libraries with your APK.

aux_source_directory(${SRC_DIR} DIR_LIB_SOURCE)
aux_source_directory(${SRC_DIR2} DIR_LIB_SOURCE2)

add_library(${TARGET} SHARED ${DIR_LIB_SOURCE} ${DIR_LIB_SOURCE2})

# Searches for a specified prebuilt library and stores the path as a
# variable. Because CMake includes system libraries in the search path by
# default, you only need to specify the name of the public NDK library
# you want to add. CMake verifies that the library exists before
# completing its build.
# ZXing
if(DEFINED WITH_QRCODE)
    add_definitions(-DWITH_QRCODE)
    set(ZXING_SRC ./zxingcpp/core)
    set(ZXING_READERS ON)
    set(ZXING_WRITERS NEW)
    set(ZXING_USE_BUNDLED_ZINT ON)
    set(ZXING_EXPERIMENTAL_API ON)
    add_subdirectory(${ZXING_SRC} ZXing EXCLUDE_FROM_ALL)
    target_link_libraries(${TARGET} ZXing::ZXing)
endif(DEFINED WITH_QRCODE)

# Development only. Hides SVE from the CPU detection done inside the library so that
# KleidiCV uses its NEON code paths: Android emulators on Apple Silicon advertise SVE2
# in HWCAP although the host CPU cannot execute a single SVE instruction.
# See hwcap_sve.cpp
option(DISABLE_SVE "hide SVE from CPU detection, for Android emulators on Apple Silicon" OFF)
if(DISABLE_SVE)
    add_definitions(-DDISABLE_SVE)
endif(DISABLE_SVE)

target_link_libraries(${TARGET} log jnigraphics z)

# Specifies libraries CMake should link to your target library. You
# can link multiple libraries, such as libraries you define in this
# build script, prebuilt third-party libraries, or system libraries.

if(${ANDROID_ABI} STREQUAL "arm64-v8a")
    target_link_libraries(${TARGET} opencv_photo opencv_imgproc opencv_core kleidicv kleidicv_hal kleidicv_thread)
# if(${ANDROID_ABI} STREQUAL x86_64)
#     target_link_libraries(${TARGET} opencv_photo opencv_imgproc opencv_core)
# elseif(${ANDROID_ABI} STREQUAL x86)
else()
    target_link_libraries(${TARGET} opencv_photo opencv_imgproc opencv_core)
endif()

target_link_libraries(${TARGET} tesseract leptonica pngx jpeg -fopenmp -static-openmp)


target_compile_options(${TARGET} PRIVATE
    -fvisibility=hidden -fvisibility-inlines-hidden
    -ffunction-sections -fdata-sections)
target_link_options(${TARGET} PRIVATE
    -Wl,--exclude-libs,ALL
    -Wl,--gc-sections
    -Wl,--icf=all)
