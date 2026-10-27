Pod::Spec.new do |s|
 s.name = 'NativeletShatterCore'
 s.version = '0.1.0'
 s.summary = 'Nativelet Glass Shatter fixed-step core'
 s.homepage = 'https://github.com/sandeepannandi/Nativelet'
 s.license = { :type => 'MIT', :file => 'LICENSE' }
 s.author = 'Nativelet'
 s.source = { :git => 'https://github.com/sandeepannandi/Nativelet.git' }
 s.platform = :ios, '15.1'
 s.source_files = 'cpp/*.{h,hpp,cpp,mm}'
 s.public_header_files = 'cpp/NativeletShatterProvider.h'
 install_modules_dependencies(s)
 s.dependency 'RNWorklets'
 s.dependency 'ReactCodegen'
 s.pod_target_xcconfig = {
  'CLANG_CXX_LANGUAGE_STANDARD' => 'c++20',
  'OTHER_CPLUSPLUSFLAGS' => '$(inherited) -ffp-contract=off -fno-fast-math',
  'HEADER_SEARCH_PATHS' => '$(inherited) "$(PODS_ROOT)/Headers/Public/ReactCodegen" "$(PODS_ROOT)/Headers/Public/RNWorklets"'
 }
end
