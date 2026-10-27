// The CxxSpec is header-only. RN autolinking attaches common compile flags to
// its named target, so provide a normal archive rather than an INTERFACE target.
namespace nativelet { void codegenAnchor() {} }
