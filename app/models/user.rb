class User < ApplicationRecord
  DEFAULT_OWNER_EMAIL = "owner@dev.com"
  DEFAULT_OWNER_PASSWORD = "Owner123!"
  THEME_PREFERENCES = %w[system light dark].freeze

  devise :database_authenticatable,
    :registerable,
    :recoverable,
    :rememberable,
    :validatable,
    :omniauthable,
    omniauth_providers: [:google_oauth2]

  enum :role, { viewer: 0, admin: 1, owner: 2 }

  validates :theme_preference, inclusion: { in: THEME_PREFERENCES }
  validate :owner_must_remain, if: :owner_role_removed?

  before_validation :set_default_name
  before_destroy :ensure_owner_remains!

  def self.from_omniauth(auth)
    email = auth.info.email.to_s.strip.downcase
    user = find_by(provider: auth.provider, uid: auth.uid) || find_or_initialize_by(email: email)

    user.email = email
    user.name = auth.info.name.presence || user.name.presence || email.split("@").first.to_s.humanize
    user.provider = auth.provider
    user.uid = auth.uid
    user.password = Devise.friendly_token[0, 32] if user.encrypted_password.blank?
    user.save!
    user
  end

  def self.ensure_default_owner!
    return if owner.exists?

    default_owner = find_or_initialize_by(email: DEFAULT_OWNER_EMAIL)
    default_owner.assign_attributes(
      name: default_owner.name.presence || "Owner",
      role: :owner,
      theme_preference: default_owner.theme_preference.presence || "system",
      password: DEFAULT_OWNER_PASSWORD,
      password_confirmation: DEFAULT_OWNER_PASSWORD
    )
    default_owner.save!
  end

  def email_address
    email
  end

  private

  def owner_role_removed?
    persisted? && role_in_database == "owner" && role != "owner"
  end

  def password_required?
    provider.blank? && super
  end

  def set_default_name
    self.name = email.to_s.split("@").first.to_s.humanize if name.blank? && email.present?
  end

  def owner_must_remain
    return unless self.class.where(role: :owner).where.not(id: id).none?

    errors.add(:role, "must leave at least one owner in the system")
  end

  def ensure_owner_remains!
    return unless owner?
    return unless self.class.where(role: :owner).where.not(id: id).none?

    errors.add(:base, "At least one owner must remain in the system")
    throw :abort
  end
end
