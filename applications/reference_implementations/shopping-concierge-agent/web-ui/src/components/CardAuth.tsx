import { useState, useEffect } from 'react'
import { showToast } from '../utils/toast'
import mockPaymentService from '../services/mockPaymentService'

interface CardAuthProps {
  userEmail: string
  cardData: {
    cardNumber: string
    cardholderName: string
    cvv: string
    expirationMonth: string
    expirationYear: string
  }
  onComplete: (result: any) => void
  onError: (error: string) => void
}

const CardAuth = ({ userEmail, cardData, onComplete, onError }: CardAuthProps) => {
  const [step, setStep] = useState<'loading' | 'enrolling' | 'authenticating' | 'otp' | 'complete'>('loading')
  const [statusMessage, setStatusMessage] = useState('Initializing...')
  const [vProvisionedTokenId, setVProvisionedTokenId] = useState('')
  const [xRequestId, setXRequestId] = useState('')
  const [clientReferenceId, setClientReferenceId] = useState('')
  const [secureToken, setSecureToken] = useState('')
  const [browserData, setBrowserData] = useState<any>(null)

  // OTP state management
  const [showOTPModal, setShowOTPModal] = useState(false)
  const [stepUpOptions, setStepUpOptions] = useState<Array<{method: string, value: string, identifier: string}>>([])
  const [selectedStepUpOption, setSelectedStepUpOption] = useState<{method: string, identifier: string} | null>(null)
  const [otpValue, setOtpValue] = useState('')
  const [otpError, setOtpError] = useState('')

  // OTP handling functions
  const handleStepUpSelection = async (option: {method: string, identifier: string}) => {
    try {
      setSelectedStepUpOption(option)
      setStatusMessage('Sending verification code...')

      const data = await mockPaymentService.stepUp({
        vProvisionedTokenId,
        identifier: option.identifier,
        method: option.method,
        xRequestId,
        clientReferenceId
      });

      if (!data.success) {
        throw new Error(data.error || 'Failed to send verification code')
      }

      console.log('✅ Step-up option selected, OTP sent')
      setStatusMessage('Please enter the verification code')
    } catch (error: any) {
      console.error('❌ Error selecting step-up option:', error)
      setOtpError(error.message || 'Failed to send verification code')
    }
  }

  const handleOTPSubmit = async () => {
    try {
      setOtpError('')
      setStatusMessage('Validating code...')

      const data = await mockPaymentService.validateOtp({
        vProvisionedTokenId,
        otpValue,
        xRequestId,
        clientReferenceId
      });

      if (!data.success) {
        throw new Error(data.error || 'Invalid verification code')
      }

      console.log('✅ OTP validated successfully')
      setShowOTPModal(false)

      // Continue to passkey creation
      await continueToPasskeyCreation()

    } catch (error: any) {
      console.error('❌ Error validating OTP:', error)
      setOtpError(error.message || 'Invalid verification code')
    }
  }

  const continueToPasskeyCreation = async () => {
    try {
      setStatusMessage('Preparing passkey creation...')

      const attestationData = await mockPaymentService.deviceAttestation({
        email: userEmail,
        vProvisionedTokenId,
        secureToken,
        browserData,
        step: 'REGISTER',
        xRequestId,
        clientReferenceId
      });

      if (!attestationData.success) {
        throw new Error(attestationData.error || 'Failed to get attestation options')
      }

      console.log('✅ Got device attestation options for REGISTER:', attestationData)

      // In mock mode, simulate biometric authentication
      console.log('🎭 MOCK MODE: Simulating biometric authentication')
      setStatusMessage('Simulating biometric authentication...')

      const mockFidoBlob = `MOCK-FIDO-BLOB-${Math.random().toString(36).substring(2, 15).toUpperCase()}`

      setTimeout(() => {
        completePasskeyRegistration(mockFidoBlob)
      }, 800)

    } catch (error: any) {
      console.error('❌ Error continuing to passkey creation:', error)
      showToast.error('Failed to set up secure authentication. Please try again.')
      onError('Failed to set up secure authentication. Please try again.')
    }
  }

  const enrollCardWithToken = async (token: string, browser: any) => {
    try {
      setStep('enrolling')
      setStatusMessage('Enrolling your card...')

      const data = await mockPaymentService.onboardCard({
        email: userEmail,
        cardNumber: cardData.cardNumber.replace(/\s/g, ''),
        cvv: cardData.cvv,
        expirationMonth: cardData.expirationMonth,
        expirationYear: cardData.expirationYear,
        secureToken: token,
        browserData: browser
      });

      if (!data.success) {
        throw new Error(data.error || 'Failed to enroll card')
      }

      console.log('✅ Card enrolled and token provisioned:', data)
      setVProvisionedTokenId(data.vProvisionedTokenId)
      setXRequestId(data.xRequestId)
      setClientReferenceId(data.clientReferenceId)

      // Device Attestation Authenticate
      setStatusMessage('Checking device status...')

      const panData = JSON.stringify({
        accountNumber: cardData.cardNumber.replace(/\s/g, ''),
        cvv2: cardData.cvv,
        expirationDate: {
          month: cardData.expirationMonth,
          year: cardData.expirationYear
        }
      })

      const attestationAuthData = await mockPaymentService.deviceAttestation({
        email: userEmail,
        vProvisionedTokenId: data.vProvisionedTokenId,
        secureToken: token,
        browserData: browser,
        step: 'AUTHENTICATE',
        panData,
        xRequestId: data.xRequestId,
        clientReferenceId: data.clientReferenceId
      });

      if (!attestationAuthData.success) {
        throw new Error(attestationAuthData.error || 'Failed to check device status')
      }

      console.log('✅ Device attestation authenticate:', attestationAuthData)

      if (attestationAuthData.action === 'REGISTER') {
        // Device Binding - get step-up options
        setStatusMessage('Setting up device verification...')

        const deviceBindingData = await mockPaymentService.deviceBinding({
          vProvisionedTokenId: data.vProvisionedTokenId,
          secureToken: token,
          email: userEmail,
          browserData: browser,
          xRequestId: data.xRequestId,
          clientReferenceId: data.clientReferenceId
        });

        if (!deviceBindingData.success) {
          throw new Error(deviceBindingData.error || 'Failed to get device binding options')
        }

        console.log('✅ Device binding options:', deviceBindingData)

        // Show OTP modal with step-up options
        setStepUpOptions(deviceBindingData.stepUpRequest || [])
        setStep('otp')
        setShowOTPModal(true)
        setStatusMessage('Please verify your identity')
      } else {
        console.log('⚠️ Unexpected action:', attestationAuthData.action)
        throw new Error('Unexpected device attestation response')
      }

    } catch (error: any) {
      console.error('❌ Error enrolling card:', error)
      let userMessage = 'Failed to enroll card. Please try again.'
      if (error.message) {
        if (error.message.includes('400')) {
          userMessage = 'Card validation failed. Please check your card details.'
        } else if (error.message.includes('401') || error.message.includes('403')) {
          userMessage = 'Authentication failed. Please contact support.'
        } else if (error.message.includes('500')) {
          userMessage = 'Service temporarily unavailable. Please try again later.'
        }
      }
      showToast.error(userMessage)
      onError(userMessage)
    }
  }

  const completePasskeyRegistration = async (fidoBlob: string) => {
    try {
      setStatusMessage('Completing passkey registration...')

      const data = await mockPaymentService.completePasskey({
        vProvisionedTokenId,
        fidoBlob
      });

      if (!data.success) {
        throw new Error(data.error || 'Failed to complete passkey registration')
      }

      console.log('✅ Passkey registration complete!')

      // VIC Enroll Card
      setStatusMessage('Enrolling card for payments...')

      const vicEnrollData = await mockPaymentService.vicEnrollCard({
        email: userEmail,
        vProvisionedTokenId
      });

      if (!vicEnrollData.success) {
        throw new Error(vicEnrollData.error || 'Failed to enroll card with VIC')
      }

      console.log('✅ VIC card enrolled:', vicEnrollData.clientReferenceId)
      setClientReferenceId(vicEnrollData.clientReferenceId)

      // Complete!
      setStep('complete')
      setStatusMessage('Card added successfully!')

      // Return success with VIC session IDs for purchase flow
      onComplete({
        vProvisionedTokenId: vProvisionedTokenId,
        lastFour: cardData.cardNumber.replace(/\s/g, '').slice(-4),
        type: 'Card',
        expirationDate: `${cardData.expirationMonth}/${cardData.expirationYear}`,
        cardholderName: cardData.cardholderName,
        consumerId: vicEnrollData.consumerId,
        clientDeviceId: vicEnrollData.clientDeviceId,
        clientReferenceId: vicEnrollData.clientReferenceId
      })

    } catch (error: any) {
      console.error('❌ Error in card onboarding flow:', error)
      showToast.error('Failed to complete card setup. Please try again or contact support.')
      onError('Failed to complete card setup. Please try again or contact support.')
    }
  }

  // Start mock flow immediately on mount
  useEffect(() => {
    console.log('🎭 MOCK MODE: Starting mock enrollment')
    setStatusMessage('Initializing mock enrollment...')

    const mockSecureToken = `MOCK-TOKEN-${Math.random().toString(36).substring(2, 15).toUpperCase()}`
    const mockBrowserData = {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      mock: true
    }

    setSecureToken(mockSecureToken)
    setBrowserData(mockBrowserData)

    setTimeout(() => {
      enrollCardWithToken(mockSecureToken, mockBrowserData)
    }, 500)
  }, [])

  return (
    <div className="p-4 bg-gray-50 rounded-lg text-center min-w-[380px]">
      <h3 className="text-lg font-semibold mb-2">🔐 Secure Card Registration</h3>
      <p className="text-gray-500 text-sm mb-3">{statusMessage}</p>

      {/* Loading spinner */}
      {(step === 'loading' || step === 'enrolling' || step === 'authenticating') && (
        <div className="inline-block w-10 h-10 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin" />
      )}

      {step === 'complete' && (
        <div className="text-emerald-500 text-5xl">✅</div>
      )}

      {/* OTP Modal */}
      {showOTPModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]">
          <div className="bg-white p-6 rounded-lg max-w-[400px] w-[90%] text-center">
            <h3 className="mt-0 font-semibold text-lg">Verify Your Identity</h3>

            {!selectedStepUpOption ? (
              <>
                <p className="text-gray-500 mb-5">
                  Please select how you'd like to receive your verification code:
                </p>
                <div className="flex flex-col gap-2">
                  {stepUpOptions.map((option, index) => (
                    <button
                      key={index}
                      onClick={() => handleStepUpSelection({method: option.method, identifier: option.identifier})}
                      className="px-5 py-3 bg-blue-600 text-white border-none rounded cursor-pointer text-sm hover:bg-blue-700"
                    >
                      {option.method === 'OTPSMS' ? `📱 SMS to ${option.value}` : `📧 Email to ${option.value}`}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <p className="text-gray-500 mb-5">
                  Enter the verification code sent to your {selectedStepUpOption.method === 'OTPSMS' ? 'phone' : 'email'}:
                </p>
                <input
                  type="text"
                  value={otpValue}
                  onChange={(e) => setOtpValue(e.target.value)}
                  placeholder="Enter code"
                  maxLength={6}
                  className="w-full p-3 text-lg text-center border border-gray-300 rounded mb-2 tracking-[8px]"
                />
                {otpError && (
                  <p className="text-red-500 text-sm mb-2">{otpError}</p>
                )}
                <div className="flex gap-2 justify-center">
                  <button
                    onClick={() => {
                      setSelectedStepUpOption(null)
                      setOtpValue('')
                      setOtpError('')
                    }}
                    className="px-5 py-3 bg-gray-500 text-white border-none rounded cursor-pointer hover:bg-gray-600"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleOTPSubmit}
                    disabled={otpValue.length === 0}
                    className={`px-5 py-3 text-white border-none rounded ${
                      otpValue.length === 0
                        ? 'bg-gray-300 cursor-not-allowed'
                        : 'bg-emerald-500 cursor-pointer hover:bg-emerald-600'
                    }`}
                  >
                    Verify
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default CardAuth
