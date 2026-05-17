import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginForm } from '@/features/auth/components/LoginForm.tsx';

const mockMutate = vi.fn();
vi.mock('@/features/auth/hooks/useAuth.ts', () => ({
  useAuth: () => ({ loginMutation: { mutate: mockMutate } }),
}));

describe('LoginForm', () => {
  it('renders email, password and submit button', () => {
    render(<LoginForm/>);
    expect(screen.getByTestId('email-input')).toBeInTheDocument();
    expect(screen.getByTestId('password-input')).toBeInTheDocument();
    expect(screen.getByTestId('submit-button')).toBeInTheDocument();
  });


  it('calls mutate with email and password on submit', async () => {
    const user = userEvent.setup();
    render(<LoginForm/>);

    await user.type(screen.getByTestId('email-input'), 'test@example.com');
    await user.type(screen.getByTestId('password-input'), 'secret');
    await user.click(screen.getByTestId('submit-button'));

    expect(mockMutate).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'secret',
    });
  });
});