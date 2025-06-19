import { Amplify } from 'aws-amplify';

const config = {
  Auth: {
    Cognito: {
      userPoolClientId: import.meta.env.VITE_USER_POOL_CLIENT_ID,
      userPoolId: import.meta.env.VITE_USER_POOL_ID,
    }
  }
};

console.log('Amplify config:', config);

try {
  Amplify.configure(config);
  console.log('Amplify configured successfully');
} catch (error) {
  console.error('Error configuring Amplify:', error);
}

export default Amplify; 