import { useState, useEffect } from 'react'
import { userProfileService } from '../services/userProfileService'
import { showToast } from '../utils/toast'
import mockPaymentService from '../services/mockPaymentService'

interface PurchaseConfirmationProps {
  userEmail: string
  userId: string
  cartItems: any[]
  onComplete: (result: any) => void
  onError: (error: string) => void
  onCancel: () => void
}

const PurchaseConfirmation = ({ userEmail, userId, cartItems, onComplete, onError, onCancel }: PurchaseConfirmationProps) => {
  const [step, setStep] = useState<'loading' | 'processing' | 'complete'>('loading')
  const [statusMessage, setStatusMessage] = useState('Initializing purchase...')

  const calculateTotal = (items: any[]): string => {
    const total = items.reduce((sum, item) => {
      const priceStr = item.price || '0'
      const match = priceStr.match(/[\d,]+\.?\d*/)
      const price = match ? parseFloat(match[0].replace(/,/g, '')) : 0
      return sum + (price * (item.qty || 1))
    }, 0)
    return total.toFixed(2)
  }

  const buildConsumerRequest = (items: any[]): string => {
    const itemDescriptions = items.map(item => `${item.title} ($${item.price})`).join(', ')
    return `Purchase from cart: ${itemDescriptions}`
  }

  // Start mock purchase flow on mount
  useEffect(() => {
    const processPurchase = async () => {
      try {
        setStatusMessage('Verifying payment method...')

        // Get enrolled card from AppSync
        const enrolledCard = await userProfileService.getEnrolledCard(userId)
        if (!enrolledCard) {
          throw new Error('No enrolled card found. Please add a payment method first.')
        }

        console.log('✅ Retrieved enrolled card:', enrolledCard.vProvisionedTokenId)

        const totalAmount = calculateTotal(cartItems)
        const consumerRequest = buildConsumerRequest(cartItems)

        // Mock: Initiate purchase
        setStep('processing')
        setStatusMessage('Processing purchase...')

        const purchaseData = await mockPaymentService.vicInitiatePurchase({
          vProvisionedTokenId: enrolledCard.vProvisionedTokenId,
          consumerId: enrolledCard.consumerId,
          clientReferenceId: enrolledCard.clientReferenceId,
          clientDeviceId: enrolledCard.clientDeviceId,
          consumerRequest,
          transactionAmount: totalAmount
        })

        if (!purchaseData.success) {
          throw new Error(purchaseData.error || 'Failed to initiate purchase')
        }

        console.log('✅ Purchase initiated:', purchaseData)
        const instructionId = purchaseData.instructionId

        // Mock: Get payment credentials
        setStatusMessage('Getting payment credentials...')

        const credentialsData = await mockPaymentService.vicPaymentCredentials({
          instructionId,
          vProvisionedTokenId: enrolledCard.vProvisionedTokenId,
          transactionAmount: totalAmount
        })

        if (!credentialsData.success) {
          throw new Error(credentialsData.error || 'Failed to get payment credentials')
        }

        console.log('✅ Payment credentials retrieved!')

        setStep('complete')
        setStatusMessage('Purchase complete!')

        onComplete({
          success: true,
          instructionId: instructionId,
          signedPayload: credentialsData.signedPayload,
          status: credentialsData.status,
          cartItems: cartItems,
          totalAmount: totalAmount
        })

      } catch (error: any) {
        console.error('❌ Error in purchase flow:', error)
        const errorMessage = error.message || 'Failed to complete purchase'
        showToast.error(errorMessage)
        onError(errorMessage)
      }
    }

    processPurchase()
  }, [])

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-700 to-blue-700-light">
          <h3 className="text-lg font-semibold text-white">🔐 Secure Purchase</h3>
          <button
            className="text-white/80 hover:text-white text-2xl font-light leading-none"
            onClick={onCancel}
          >
            ×
          </button>
        </div>

        <div className="p-6">
          <p className="text-center text-gray-600 mb-4">{statusMessage}</p>

          {/* Loading spinner */}
          {(step === 'loading' || step === 'processing') && (
            <div className="flex justify-center my-5">
              <div className="w-8 h-8 border-2 border-blue-700/20 border-t-blue-700 rounded-full animate-spin"></div>
            </div>
          )}

          {/* Success */}
          {step === 'complete' && (
            <div className="text-center my-5">
              <div className="text-5xl text-emerald-500">✅</div>
              <p className="text-emerald-500 font-bold mt-2">Payment Authorized!</p>
            </div>
          )}

          {/* Cart summary */}
          {step !== 'complete' && (
            <div className="bg-gray-50 rounded-lg p-4 mt-4">
              <h4 className="font-semibold text-gray-800 mb-3">Order Summary</h4>
              <div className="space-y-2">
                {cartItems.map((item, index) => (
                  <div key={index} className="flex justify-between text-sm text-gray-600">
                    <span className="truncate mr-2">{item.title}</span>
                    <span className="font-medium">{item.price}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-4 pt-3 border-t border-gray-200">
                <span className="font-semibold text-gray-800">Total:</span>
                <span className="font-semibold text-blue-700">${calculateTotal(cartItems)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default PurchaseConfirmation
