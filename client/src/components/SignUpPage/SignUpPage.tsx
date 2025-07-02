import React, { useState, FormEvent, ChangeEvent } from 'react';
import { signUp, confirmSignUp, resendSignUpCode } from 'aws-amplify/auth';
import { Role, updateRoleSelection } from '../../types/auth';
import '../Auth/Auth.css';

interface SignUpFormData {
  email: string;
  password: string;
  confirmPassword: string;
  confirmationCode: string;
  selectedRoles: Role;
}

interface SignUpPageProps {
  onSignUpSuccess: () => void;
  onSwitchToLogin: () => void;
}

const SignUpPage: React.FC<SignUpPageProps> = ({ onSignUpSuccess, onSwitchToLogin }) => {
  const [isConfirming, setIsConfirming] = useState<boolean>(false);
  const [formData, setFormData] = useState<SignUpFormData>({
    email: '',
    password: '',
    confirmPassword: '',
    confirmationCode: '',
    selectedRoles: ['Subscriber']
  });
  const [error, setError] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    setError('');
  };

  const handleRoleChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const { value, checked } = e.target;
    const role = value as 'Subscriber' | 'Publisher';
    
    setFormData(prev => ({
      ...prev,
      selectedRoles: updateRoleSelection(prev.selectedRoles, role, checked)
    }));
  };

  const handleSignUp = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setError('');
    setMessage('');
    setIsLoading(true);

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters long');
      setIsLoading(false);
      return;
    }

    try {
      await signUp({
        username: formData.email,
        password: formData.password,
        options: {
          userAttributes: {
            email: formData.email,
            'custom:preferred_roles': formData.selectedRoles.join(',')
          }
        }
      });
      
      setMessage('User created successfully! Please check your email for verification code.');
      setIsConfirming(true);
      setFormData({ ...formData, password: '', confirmPassword: '' });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Sign up failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmSignUp = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setError('');
    setMessage('');
    setIsLoading(true);

    try {
      await confirmSignUp({
        username: formData.email,
        confirmationCode: formData.confirmationCode
      });
      setMessage('Email verified successfully! You can now sign in.');
      setTimeout(() => {
        onSignUpSuccess();
      }, 2000);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Verification failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async (): Promise<void> => {
    setIsLoading(true);
    try {
      await resendSignUpCode({
        username: formData.email
      });
      setMessage('Verification code resent!');
      setError('');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to resend code');
    } finally {
      setIsLoading(false);
    }
  };

  const confirmSignUpForm: React.JSX.Element = 
    (
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
              disabled={isLoading}
            />
          </div>
          <button type="submit" className="auth-button" disabled={isLoading}>
            {isLoading ? 'Verifying...' : 'Verify Email'}
          </button>
          <button 
            type="button" 
            onClick={handleResendCode} 
            className="auth-button secondary"
            disabled={isLoading}
          >
            Resend Code
          </button>
          <button 
            type="button" 
            onClick={() => {
              setError(''); // Clear error when going back
              setMessage(''); // Clear message when going back
              setFormData({ // Reset form data to clean state
                email: '',
                password: '',
                confirmPassword: '',
                confirmationCode: '',
                selectedRoles: ['Subscriber']
              });
              setIsConfirming(false);
            }} 
            className="auth-button secondary"
            disabled={isLoading}
          >
            Back to Sign Up
          </button>
        </form>
    );

    const signUpForm: React.JSX.Element = 
    (
        <form onSubmit={handleSignUp}>
            <div className="form-group">
            <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                placeholder="Enter your email"
                required
                disabled={isLoading}
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
                disabled={isLoading}
            />
            </div>
            <div className="form-group">
            <input
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleInputChange}
                placeholder="Confirm your password"
                required
                disabled={isLoading}
            />
            </div>
            <div className="form-group">
            <label>Select your role(s):</label>
            <div className="role-selection">
                <label className="checkbox-label">
                <input
                    type="checkbox"
                    value="Subscriber"
                    checked={formData.selectedRoles.includes('Subscriber')}
                    onChange={handleRoleChange}
                    disabled={isLoading}
                />
                Subscriber - Browse and install apps
                </label>
                <label className="checkbox-label">
                <input
                    type="checkbox"
                    value="Publisher"
                    checked={formData.selectedRoles.includes('Publisher')}
                    onChange={handleRoleChange}
                    disabled={isLoading}
                />
                Publisher - Upload and publish apps
                </label>
            </div>
            </div>
            <button type="submit" className="auth-button" disabled={isLoading}>
            {isLoading ? 'Creating Account...' : 'Sign Up'}
            </button>
                      <button 
            type="button" 
            onClick={() => {
              setError(''); // Clear error when switching views
              setMessage(''); // Clear message when switching views
              onSwitchToLogin();
            }} 
            className="auth-button secondary"
            disabled={isLoading}
          >
            Already have an account? Sign In
          </button>
        </form>
    );

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>{isConfirming ? 'Verify Email' : 'Sign Up'}</h2>
        
        {error && <p className="error">{error}</p>}
        {message && <p className="message">{message}</p>}

        {isConfirming ?  confirmSignUpForm: signUpForm}
      </div>
    </div>
  );
};

export default SignUpPage; 