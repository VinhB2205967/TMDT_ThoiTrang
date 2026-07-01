#!/bin/bash
# 🎨 Modern Auth System - Installation & Setup Script

echo "🚀 Starting Modern Auth System Setup..."
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

echo "✅ Node.js found: $(node -v)"
echo ""

# Check npm packages (optional - since we use CDN)
echo "📦 Checking npm packages..."
npm list gsap &> /dev/null || echo "⚠️  gsap not found locally (using CDN instead)"
npm list animate.css &> /dev/null || echo "⚠️  animate.css not found locally (using CDN instead)"
npm list sweetalert2 &> /dev/null || echo "⚠️  sweetalert2 not found locally (using CDN instead)"

echo ""
echo "✅ Modern Auth System Setup Complete!"
echo ""
echo "📝 Next Steps:"
echo "1. Update your auth route to use 'index-modern' instead of 'index'"
echo "2. Test the form at: http://localhost:3000/auth"
echo "3. Check browser console for any errors (F12)"
echo ""
echo "🎨 Customization:"
echo "- Edit /public/css/auth-modern.css for styling"
echo "- Edit /public/js/auth-modern.js for interactions"
echo "- Edit /views/client/pages/auth/index-modern.pug for HTML"
echo ""
echo "📚 Documentation: See AUTH_MODERN_GUIDE.md"
echo ""
