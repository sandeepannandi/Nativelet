#pragma once
#include "generated/NativeletShatterSpecsJSI.h"
namespace facebook::react {
class NativeletShatter : public NativeletShatterCxxSpec<NativeletShatter> {
 public:
 explicit NativeletShatter(std::shared_ptr<CallInvoker> invoker);
 bool install(jsi::Runtime&rt,jsi::Object runtimeHolder,jsi::Object schedulerHolder);
};
}
