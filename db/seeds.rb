# This file should ensure the existence of records required to run the application in every environment.

if Rails.env.development?
  User.ensure_default_owner!

  puts "Ensured owner user: #{User::DEFAULT_OWNER_EMAIL} / #{User::DEFAULT_OWNER_PASSWORD}"
end
