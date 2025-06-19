import React, { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import { signUp, signIn, signOut, confirmSignUp, resendSignUpCode, getCurrentUser, fetchUserAttributes, fetchAuthSession } from 'aws-amplify/auth';
import './Auth.css';

interface FormData {
  email: string;
  password: string;
  confirmPassword: string;
  confirmationCode: string;
}

interface CognitoUser {
  username: string;
  userId: string;
  groups?: string[];
  signInDetails?: {
    loginId?: string;
  };
}

const AuthComponent = (): React.JSX.Element => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [user, setUser] = useState<CognitoUser | null>(null);
  const [isSignUp, setIsSignUp] = useState<boolean>(false);
  const [isConfirming, setIsConfirming] = useState<boolean>(false);
  const [isPublisher, setIsPublisher] = useState<boolean>(false);
  const [formData, setFormData] = useState<FormData>({
    email: '',
    password: '',
    confirmPassword: '',
    confirmationCode: ''
  });
  const [error, setError] = useState<string>('');
  const [message, setMessage] = useState<string>('');

  useEffect(() => {
    checkAuthState();
  }, []);

  const checkAuthState = async (): Promise<void> => {
    try {
      const currentUser = await getCurrentUser();
      const userAttributes = await fetchUserAttributes();
      const session = await fetchAuthSession();
      
      // Get user groups from the access token
      const accessToken = session.tokens?.accessToken.toString() || '';
      const payload = accessToken ? JSON.parse(atob(accessToken.split('.')[1])) : {};
      const groups = payload['cognito:groups'] || [];
      
      setIsAuthenticated(true);
      setUser({
        ...currentUser,
        groups,
        signInDetails: {
          loginId: userAttributes.email
        }
      });
      setIsPublisher(groups.includes('Publisher'));
    } catch (error) {
      setIsAuthenticated(false);
      setUser(null);
      setIsPublisher(false);
      console.error(error);
    }
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const { name, value } = e.target;
    console.log('Input change:', name, value);
    setFormData(prev => {
      const newState = {
        ...prev,
        [name]: value
      };
      console.log('New form state:', newState);
      return newState;
    });
    setError('');
  };

  const handleSignUp = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    try {
      await signUp({
        username: formData.email,
        password: formData.password,
        options: {
          userAttributes: {
            email: formData.email
          }
        }
      });
      
      setMessage('User created successfully! Please check your email for verification code.');
      setIsConfirming(true);
      setFormData({ ...formData, password: '', confirmPassword: '' });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'An error occurred');
    }
  };

  const handleConfirmSignUp = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setError('');
    setMessage('');

    try {
      await confirmSignUp({
        username: formData.email,
        confirmationCode: formData.confirmationCode
      });
      setMessage('Email verified successfully! You can now sign in.');
      setIsConfirming(false);
      setIsSignUp(false);
      setFormData({ email: '', password: '', confirmPassword: '', confirmationCode: '' });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'An error occurred');
    }
  };

  const handleSignIn = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setError('');
    setMessage('');

    try {
      const signInResult = await signIn({
        username: formData.email,
        password: formData.password
      });
      setIsAuthenticated(true);
      setUser(signInResult as unknown as CognitoUser);
      setMessage('Signed in successfully!');
      setFormData({ email: '', password: '', confirmPassword: '', confirmationCode: '' });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'An error occurred');
    }
  };

  const handleSignOut = async (): Promise<void> => {
    try {
      await signOut();
      setIsAuthenticated(false);
      setUser(null);
      setMessage('Signed out successfully!');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'An error occurred');
    }
  };

  const handleResendCode = async (): Promise<void> => {
    try {
      await resendSignUpCode({
        username: formData.email
      });
      setMessage('Verification code resent!');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'An error occurred');
    }
  };

  if (isAuthenticated && user) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h2>Welcome!</h2>
          <p>You are signed in as: <strong>{user.username}</strong></p>
          <div className="user-info">
            <p><strong>User ID:</strong> {user.userId}</p>
            <p><strong>Email:</strong> {user.signInDetails?.loginId}</p>
            <p><strong>Role:</strong> {isPublisher ? 'Publisher' : 'User'}</p>
          </div>
          <button onClick={handleSignOut} className="auth-button signout">
            Sign Out
          </button>
          {message && <p className="message">{message}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>{isConfirming ? 'Verify Email' : isSignUp ? 'Sign Up' : 'Sign In'}</h2>
        
        {error && <p className="error">{error}</p>}
        {message && <p className="message">{message}</p>}

        {isConfirming ? (
          <form onSubmit={handleConfirmSignUp}>
            <div className="form-group">
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                required
                disabled
              />
            </div>
            <div className="form-group">
              <input
                type="text"
                name="confirmationCode"
                value={formData.confirmationCode}
                onChange={handleInputChange}
                placeholder="Enter code from email"
                required
              />
            </div>
            <button type="submit" className="auth-button">
              Verify Email
            </button>
            <button type="button" onClick={handleResendCode} className="auth-button secondary">
              Resend Code
            </button>
            <button type="button" onClick={() => setIsConfirming(false)} className="auth-button secondary">
              Back to Sign Up
            </button>
          </form>
        ) : (
          <form onSubmit={isSignUp ? handleSignUp : handleSignIn}>
            <div className="form-group">
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                placeholder="Enter your email"
                required
              />
            </div>
            <div className="form-group">
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleInputChange}
                placeholder="Enter your password"
                required
              />
            </div>
            {isSignUp && (
              <div className="form-group">
                <input
                  type="password"
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  placeholder="Confirm your password"
                  required
                />
              </div>
            )}
            <button type="submit" className="auth-button">
              {isSignUp ? 'Sign Up' : 'Sign In'}
            </button>
            <button 
              type="button" 
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError('');
                setMessage('');
                setFormData({ email: '', password: '', confirmPassword: '', confirmationCode: '' });
              }} 
              className="auth-button secondary"
            >
              {isSignUp ? 'Already have an account? Sign In' : 'Need an account? Sign Up'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default AuthComponent; 