# React + AWS Amplify Authentication App

A modern React application with AWS Cognito authentication, built with Vite and ready for Netlify deployment.

## 🚀 Features

- **AWS Cognito Integration**: Complete authentication flow with sign up, sign in, and sign out
- **Email Verification**: Automatic email verification with confirmation codes
- **Modern UI**: Beautiful, responsive design with smooth animations
- **Netlify Ready**: Configured for easy deployment to Netlify
- **Environment Variables**: Secure configuration management

## 📋 Prerequisites

- Node.js 18+ 
- AWS Cognito User Pool (configured in the server directory)
- Netlify account (for deployment)

## 🛠️ Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables

Copy the example environment file and update with your Cognito details:

```bash
cp env.example .env.local
```

Update `.env.local` with your actual Cognito configuration:
```env
VITE_AWS_REGION=us-east-1
VITE_USER_POOL_ID=us-east-1_xxxxxxxxx
VITE_USER_POOL_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 3. Get Cognito Configuration

After deploying your Terraform infrastructure in the server directory:

```bash
cd ../server
terraform state show aws_cognito_user_pool.publisher_pool | grep id
terraform state show aws_cognito_user_pool_client.publisher_client | grep id
```

### 4. Run Development Server
```bash
npm run dev
```

The app will be available at `http://localhost:5173`

## 🚀 Deployment to Netlify

### Option 1: Deploy via Netlify UI

1. **Build the project**:
   ```bash
   npm run build
   ```

2. **Deploy to Netlify**:
   - Go to [netlify.com](https://netlify.com)
   - Drag and drop the `dist` folder to deploy
   - Or connect your GitHub repository for automatic deployments

3. **Set Environment Variables**:
   - In Netlify dashboard, go to Site settings > Environment variables
   - Add the same environment variables from your `.env.local` file

### Option 2: Deploy via Netlify CLI

1. **Install Netlify CLI**:
   ```bash
   npm install -g netlify-cli
   ```

2. **Login to Netlify**:
   ```bash
   netlify login
   ```

3. **Deploy**:
   ```bash
   npm run build
   netlify deploy --prod --dir=dist
   ```

4. **Set Environment Variables**:
   ```bash
   netlify env:set VITE_AWS_REGION us-east-1
   netlify env:set VITE_USER_POOL_ID your-user-pool-id
   netlify env:set VITE_USER_POOL_CLIENT_ID your-client-id
   ```

## 🔐 Authentication Flow

1. **Sign Up**: User creates account with email and password
2. **Email Verification**: User receives verification code via email
3. **Sign In**: User logs in with verified credentials
4. **Session Management**: App maintains authentication state
5. **Sign Out**: User logs out and session is cleared

## 📁 Project Structure

```
client/
├── src/
│   ├── components/
│   │   ├── Auth.jsx          # Main authentication component
│   │   └── Auth.css          # Authentication styles
│   ├── App.jsx               # Main app component
│   ├── App.css               # App styles
│   └── amplify.js            # AWS Amplify configuration
├── netlify.toml              # Netlify configuration
├── env.example               # Environment variables example
└── README.md                 # This file
```

## 🎨 Customization

### Styling
- Modify `src/components/Auth.css` to customize the appearance
- The app uses CSS custom properties for easy theming
- Responsive design included for mobile devices

### Functionality
- Edit `src/components/Auth.jsx` to modify authentication behavior
- Add additional user attributes in the sign-up process
- Implement password reset functionality

## 🔒 Security Notes

- Environment variables are prefixed with `VITE_` for client-side access
- No AWS credentials are stored in the frontend
- JWT tokens are handled securely by AWS Amplify
- HTTPS is enforced in production

## 🐛 Troubleshooting

### Common Issues

1. **"Missing Authentication Token"**: Check your Cognito configuration
2. **Build errors**: Ensure Node.js version is 18+
3. **Environment variables not working**: Verify they're prefixed with `VITE_`
4. **Netlify deployment fails**: Check build logs and environment variables

### Development Tips

- Use browser dev tools to inspect network requests
- Check AWS Cognito console for user management
- Monitor Netlify function logs for server-side issues

## 📚 Resources

- [AWS Amplify Documentation](https://docs.amplify.aws/)
- [AWS Cognito Documentation](https://docs.aws.amazon.com/cognito/)
- [Netlify Documentation](https://docs.netlify.com/)
- [Vite Documentation](https://vitejs.dev/)
