#pragma once
#include <cmath>
#include <cstddef>
#include <stdexcept>
#include <limits>
namespace shatter {
inline double jsmax(double a,double b){if(std::isnan(a)||std::isnan(b))return std::numeric_limits<double>::quiet_NaN();if(a==b&&a==0)return std::signbit(a)&&std::signbit(b)?-0.0:0.0;return a>b?a:b;}
inline double jsmin(double a,double b){if(std::isnan(a)||std::isnan(b))return std::numeric_limits<double>::quiet_NaN();if(a==b&&a==0)return std::signbit(a)||std::signbit(b)?-0.0:0.0;return a<b?a:b;}
}
