import {
  validateRequired,
  validateMaxLength,
  validateMinLength,
  validatePositiveNumber,
  validateNumberRange,
  validateDecimalPlaces,
  validateEmail,
  validateStellarAddress,
  validateAllowedValues,
  validateDueDate,
  combineValidators,
} from '../fieldValidators';

describe('fieldValidators', () => {
  describe('validateRequired', () => {
    it('returns error for empty string', () => {
      const validator = validateRequired('Username');
      expect(validator('')).toBe('Username is required');
    });

    it('returns error for whitespace-only string', () => {
      const validator = validateRequired('Email');
      expect(validator('   ')).toBe('Email is required');
    });

    it('returns null for non-empty string', () => {
      const validator = validateRequired('Title');
      expect(validator('Valid title')).toBeNull();
    });
  });

  describe('validateMaxLength', () => {
    it('returns error when length exceeds maximum', () => {
      const validator = validateMaxLength('Name', 10);
      expect(validator('This is too long')).toBe('Name must be no more than 10 characters');
    });

    it('returns null when length is within limit', () => {
      const validator = validateMaxLength('Name', 10);
      expect(validator('Short')).toBeNull();
    });

    it('returns null when length equals maximum', () => {
      const validator = validateMaxLength('Name', 10);
      expect(validator('1234567890')).toBeNull();
    });
  });

  describe('validateMinLength', () => {
    it('returns error when non-empty string is too short', () => {
      const validator = validateMinLength('Password', 8);
      expect(validator('abc')).toBe('Password must be at least 8 characters');
    });

    it('returns null when length meets minimum', () => {
      const validator = validateMinLength('Password', 8);
      expect(validator('password')).toBeNull();
    });

    it('returns null for empty string (let required validator handle it)', () => {
      const validator = validateMinLength('Password', 8);
      expect(validator('')).toBeNull();
      expect(validator('   ')).toBeNull();
    });
  });

  describe('validatePositiveNumber', () => {
    it('returns error for non-numeric input', () => {
      const validator = validatePositiveNumber('Amount');
      expect(validator('abc')).toBe('Amount must be a positive number');
    });

    it('returns error for zero', () => {
      const validator = validatePositiveNumber('Amount');
      expect(validator('0')).toBe('Amount must be a positive number');
    });

    it('returns error for negative number', () => {
      const validator = validatePositiveNumber('Amount');
      expect(validator('-5')).toBe('Amount must be a positive number');
    });

    it('returns null for positive integer', () => {
      const validator = validatePositiveNumber('Amount');
      expect(validator('100')).toBeNull();
    });

    it('returns null for positive decimal', () => {
      const validator = validatePositiveNumber('Amount');
      expect(validator('99.99')).toBeNull();
    });

    it('returns null for empty string', () => {
      const validator = validatePositiveNumber('Amount');
      expect(validator('')).toBeNull();
    });

    it('returns error for infinity', () => {
      const validator = validatePositiveNumber('Amount');
      expect(validator('Infinity')).toBe('Amount must be a positive number');
    });
  });

  describe('validateNumberRange', () => {
    it('returns error when number is below minimum', () => {
      const validator = validateNumberRange('Age', 18, 65);
      expect(validator('10')).toBe('Age must be between 18 and 65');
    });

    it('returns error when number is above maximum', () => {
      const validator = validateNumberRange('Age', 18, 65);
      expect(validator('70')).toBe('Age must be between 18 and 65');
    });

    it('returns null when number is within range', () => {
      const validator = validateNumberRange('Age', 18, 65);
      expect(validator('30')).toBeNull();
    });

    it('returns null when number equals minimum', () => {
      const validator = validateNumberRange('Age', 18, 65);
      expect(validator('18')).toBeNull();
    });

    it('returns null when number equals maximum', () => {
      const validator = validateNumberRange('Age', 18, 65);
      expect(validator('65')).toBeNull();
    });

    it('returns error for non-numeric input', () => {
      const validator = validateNumberRange('Age', 18, 65);
      expect(validator('abc')).toBe('Age must be a valid number');
    });
  });

  describe('validateDecimalPlaces', () => {
    it('returns error when decimal places exceed maximum', () => {
      const validator = validateDecimalPlaces('Price', 2);
      expect(validator('99.999')).toBe('Price must have at most 2 decimal places');
    });

    it('returns null when decimal places are within limit', () => {
      const validator = validateDecimalPlaces('Price', 2);
      expect(validator('99.99')).toBeNull();
    });

    it('returns null for integer (no decimal point)', () => {
      const validator = validateDecimalPlaces('Price', 2);
      expect(validator('100')).toBeNull();
    });

    it('returns null for single decimal place when max is 2', () => {
      const validator = validateDecimalPlaces('Price', 2);
      expect(validator('99.9')).toBeNull();
    });

    it('handles singular form correctly', () => {
      const validator = validateDecimalPlaces('Price', 1);
      expect(validator('99.99')).toBe('Price must have at most 1 decimal place');
    });
  });

  describe('validateEmail', () => {
    it('returns error for string without @', () => {
      const validator = validateEmail();
      expect(validator('notanemail')).toBe('Email must be valid');
    });

    it('returns null for string with @', () => {
      const validator = validateEmail();
      expect(validator('user@example.com')).toBeNull();
    });

    it('returns null for empty string', () => {
      const validator = validateEmail();
      expect(validator('')).toBeNull();
    });

    it('returns null for minimal valid format', () => {
      const validator = validateEmail();
      expect(validator('a@b')).toBeNull();
    });
  });

  describe('validateStellarAddress', () => {
    it('returns error for invalid Stellar address', () => {
      const validator = validateStellarAddress('Address');
      expect(validator('INVALID')).toBe('Address must be a valid Stellar G... address');
    });

    it('returns error for address not starting with G', () => {
      const validator = validateStellarAddress('Address');
      const invalidAddress = 'A'.repeat(56);
      expect(validator(invalidAddress)).toBe('Address must be a valid Stellar G... address');
    });

    it('returns error for address with wrong length', () => {
      const validator = validateStellarAddress('Address');
      expect(validator('G123')).toBe('Address must be a valid Stellar G... address');
    });

    it('returns null for valid Stellar address', () => {
      const validator = validateStellarAddress('Address');
      const validAddress = 'GDRXE2BQUC3AZNPVFSCEZ76NJ3WWL25FYFK6RGZGIEKWE4SOOHSUJAXE';
      expect(validator(validAddress)).toBeNull();
    });

    it('returns null for empty string', () => {
      const validator = validateStellarAddress('Address');
      expect(validator('')).toBeNull();
    });
  });

  describe('validateAllowedValues', () => {
    it('returns error for value not in allowed list', () => {
      const validator = validateAllowedValues('Currency', ['USD', 'EUR', 'GBP']);
      expect(validator('JPY')).toBe('Currency must be one of: USD, EUR, GBP');
    });

    it('returns null for value in allowed list', () => {
      const validator = validateAllowedValues('Currency', ['USD', 'EUR', 'GBP']);
      expect(validator('USD')).toBeNull();
    });

    it('returns null for empty string', () => {
      const validator = validateAllowedValues('Currency', ['USD', 'EUR']);
      expect(validator('')).toBeNull();
    });

    it('handles whitespace correctly', () => {
      const validator = validateAllowedValues('Status', ['Active', 'Pending']);
      expect(validator('  Active  ')).toBeNull();
    });
  });

  describe('validateDueDate', () => {
    it('returns error for invalid date format', () => {
      const validator = validateDueDate();
      expect(validator('2025-06-01')).toBe('Due date must be in the format "Jun 1, 2025"');
    });

    it('returns error for nonsense input', () => {
      const validator = validateDueDate();
      expect(validator('yesterday')).toBe('Due date must be in the format "Jun 1, 2025"');
    });

    it('returns null for valid abbreviated month format', () => {
      const validator = validateDueDate();
      expect(validator('Jun 1, 2025')).toBeNull();
    });

    it('returns null for valid full month format', () => {
      const validator = validateDueDate();
      expect(validator('June 1, 2025')).toBeNull();
    });

    it('returns null for zero-padded day', () => {
      const validator = validateDueDate();
      expect(validator('Jun 01, 2025')).toBeNull();
    });

    it('returns null for double-digit day', () => {
      const validator = validateDueDate();
      expect(validator('Dec 31, 2025')).toBeNull();
    });

    it('returns null for empty string (optional field)', () => {
      const validator = validateDueDate();
      expect(validator('')).toBeNull();
    });

    it('handles case-insensitive month names', () => {
      const validator = validateDueDate();
      expect(validator('JUN 1, 2025')).toBeNull();
      expect(validator('jun 1, 2025')).toBeNull();
    });
  });

  describe('combineValidators', () => {
    it('returns first error encountered', () => {
      const validator = combineValidators([
        validateRequired('Name'),
        validateMaxLength('Name', 10),
      ]);
      expect(validator('')).toBe('Name is required');
    });

    it('returns null when all validators pass', () => {
      const validator = combineValidators([
        validateRequired('Name'),
        validateMaxLength('Name', 10),
      ]);
      expect(validator('Valid')).toBeNull();
    });

    it('stops at first validation error', () => {
      const validator = combineValidators([
        validateRequired('Password'),
        validateMinLength('Password', 8),
        validateMaxLength('Password', 20),
      ]);
      expect(validator('abc')).toBe('Password must be at least 8 characters');
    });

    it('validates all rules in sequence', () => {
      const validator = combineValidators([
        validateRequired('Amount'),
        validatePositiveNumber('Amount'),
        validateNumberRange('Amount', 1, 1000),
      ]);
      expect(validator('2000')).toBe('Amount must be between 1 and 1,000');
    });

    it('works with empty validator array', () => {
      const validator = combineValidators([]);
      expect(validator('anything')).toBeNull();
    });
  });

  describe('Integration scenarios', () => {
    it('validates contract name with combined rules', () => {
      const validator = combineValidators([
        validateRequired('Contract name'),
        validateMaxLength('Contract name', 200),
      ]);

      expect(validator('')).toBe('Contract name is required');
      expect(validator('a'.repeat(201))).toBe('Contract name must be no more than 200 characters');
      expect(validator('Valid Contract Name')).toBeNull();
    });

    it('validates payout amount with multiple numeric rules', () => {
      const validator = combineValidators([
        validateRequired('Payout'),
        validatePositiveNumber('Payout'),
        validateNumberRange('Payout', 0.01, 10000000),
        validateDecimalPlaces('Payout', 2),
      ]);

      expect(validator('')).toBe('Payout is required');
      expect(validator('0')).toBe('Payout must be a positive number');
      expect(validator('20000000')).toBe('Payout must be between 0.01 and 10,000,000');
      expect(validator('99.999')).toBe('Payout must have at most 2 decimal places');
      expect(validator('1000.50')).toBeNull();
    });

    it('validates Stellar address with combined rules', () => {
      const validator = combineValidators([
        validateRequired('Freelancer address'),
        validateStellarAddress('Freelancer address'),
      ]);

      expect(validator('')).toBe('Freelancer address is required');
      expect(validator('INVALID')).toBe('Freelancer address must be a valid Stellar G... address');
      expect(validator('GDRXE2BQUC3AZNPVFSCEZ76NJ3WWL25FYFK6RGZGIEKWE4SOOHSUJAXE')).toBeNull();
    });
  });
});
