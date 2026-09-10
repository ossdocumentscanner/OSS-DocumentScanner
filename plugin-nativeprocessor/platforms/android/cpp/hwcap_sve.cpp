// Development only: compiled in when the `DISABLE_SVE` CMake option is set
// (`--gradleArgs=-PdisableSVE` on the build command line). Toggling the flag alone may
// not be enough, the CLI reuses the prebuilt plugin aar until a plugin source changes.
//
// Android emulators running on Apple Silicon advertise SVE, SVE2 and friends in HWCAP
// even though the host CPU implements none of them. KleidiCV, which OpenCV uses as its
// arm64 HAL, reads HWCAP in its static initializers and picks its SVE2 kernels
// accordingly, so the first SVE instruction executed (`addvl`) raises SIGILL and kills
// the app. It shows up as a crash in `nativeCrop` through `cv::remap`.
//
// Defining `getauxval` here makes the linker bind every call coming from OpenCV and
// KleidiCV to this version instead of libc's, and hiding the SVE bits makes KleidiCV
// fall back to its NEON implementations. Never enable this for a release build: it
// would give up KleidiCV's SVE2 code paths on the devices that really support them.
#if defined(DISABLE_SVE) && defined(__aarch64__)

#include <asm/hwcap.h>
#include <dlfcn.h>
#include <sys/auxv.h>

namespace {

constexpr unsigned long kSveHwcapMask = HWCAP_SVE;

constexpr unsigned long kSveHwcap2Mask = HWCAP2_SVE2 | HWCAP2_SVEAES | HWCAP2_SVEPMULL |
                                         HWCAP2_SVEBITPERM | HWCAP2_SVESHA3 | HWCAP2_SVESM4 |
                                         HWCAP2_SVEI8MM | HWCAP2_SVEF32MM | HWCAP2_SVEF64MM |
                                         HWCAP2_SVEBF16 | HWCAP2_SVE_EBF16 | HWCAP2_SVE2P1 |
                                         HWCAP2_SVE_B16B16;

using GetAuxValFn = unsigned long (*)(unsigned long);

} // namespace

extern "C" __attribute__((visibility("hidden"))) unsigned long getauxval(unsigned long type) {
    static GetAuxValFn realGetAuxVal = nullptr;
    static bool resolving = false;
    if (realGetAuxVal == nullptr) {
        if (resolving) {
            // `dlsym` called us back before we could resolve: report no CPU feature at all
            return 0;
        }
        resolving = true;
        auto resolved = reinterpret_cast<GetAuxValFn>(dlsym(RTLD_DEFAULT, "getauxval"));
        resolving = false;
        if (resolved == nullptr || resolved == &getauxval) {
            // never call ourselves: this function is hidden so `dlsym` should not see it,
            // but a mistake here would recurse until the stack blows up
            return 0;
        }
        realGetAuxVal = resolved;
    }
    const unsigned long value = realGetAuxVal(type);
    if (type == AT_HWCAP) {
        return value & ~kSveHwcapMask;
    }
    if (type == AT_HWCAP2) {
        return value & ~kSveHwcap2Mask;
    }
    return value;
}

#endif // DISABLE_SVE && __aarch64__
